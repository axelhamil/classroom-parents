import { readFileSync } from "node:fs";
import type { Breadcrumb, IInstrumentation, SpanOptions } from "@packages/ddd-kit";
import { Result } from "@packages/ddd-kit";
import { z } from "zod";
import type { ILanguageModel } from "../src/contract/language-model.port";
import { MeteredLanguageModel } from "../src/decorators/metered-language-model";
import type { AiCallEntry, AiCallLogError, IAiCallLog } from "../src/journal/ai-call-log.port";
import { anthropicLanguageModel } from "../src/provider/anthropic-language-model";

/** Scores of one run, by metric name; the thresholds file names the same metrics. */
export type Scores = Record<string, number>;

/** Keeps every call of a run in memory, so a run reports what it cost like production does. */
export class RecordingCallLog implements IAiCallLog {
  readonly entries: AiCallEntry[] = [];

  async record(entry: AiCallEntry): Promise<Result<void, AiCallLogError>> {
    this.entries.push(entry);
    return Result.ok();
  }

  costUsd(): number {
    return this.entries.reduce((total, entry) => total + entry.costMicroUsd, 0) / 1_000_000;
  }

  maxOutputTokens(): number {
    return Math.max(0, ...this.entries.map((entry) => entry.outputTokens));
  }
}

/** Telemetry for a run: no tracing backend, provider failures printed by name only. */
export class EvalInstrumentation implements IInstrumentation {
  startSpan<T>(_options: SpanOptions, callback: () => T): T {
    return callback();
  }

  capture(error: unknown): void {
    console.error(`  provider error: ${error instanceof Error ? error.name : "unknown"}`);
  }

  addBreadcrumb(_crumb: Breadcrumb): void {}

  setSpanAttributes(_attributes: Record<string, string | number | boolean>): void {}

  async flush(): Promise<boolean> {
    return true;
  }
}

const EVAL_TIMEOUT_MS = 60_000;

/** The production adapter behind the meter, with the key of the evaluation workspace. */
export function evalModel(log: RecordingCallLog): ILanguageModel {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey === "") throw new Error("ANTHROPIC_API_KEY is required");

  const instrumentation = new EvalInstrumentation();
  const provider = anthropicLanguageModel({ apiKey, timeoutMs: EVAL_TIMEOUT_MS }, instrumentation);

  return new MeteredLanguageModel(provider, log, instrumentation);
}

/** Runs `work` over `items` with at most `limit` calls in flight, keeping the input order. */
export async function mapBounded<T, U>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<U>,
): Promise<U[]> {
  const results: U[] = [];
  let next = 0;
  const worker = async () => {
    for (let index = next++; index < items.length; index = next++) {
      const item = items[index];
      if (item !== undefined) results[index] = await work(item);
    }
  };

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? Number.NaN;

  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? upper) + upper) / 2;
}

/** The median of every metric over several runs: one run of a model is too noisy to gate on. */
export function medianScores(runs: readonly Scores[]): Scores {
  const names = [...new Set(runs.flatMap((run) => Object.keys(run)))];

  return Object.fromEntries(
    names.map((name) => [name, median(runs.map((run) => run[name] ?? Number.NaN))]),
  );
}

const boundSchema = z.object({ min: z.number().optional(), max: z.number().optional() });
const thresholdsSchema = z.record(z.string(), z.record(z.string(), boundSchema));

/** Reads the bounds of one suite from `eval/thresholds.json`. */
export function thresholdsOf(suite: string): Record<string, z.infer<typeof boundSchema>> {
  const raw = readFileSync(new URL("./thresholds.json", import.meta.url), "utf8");
  const bounds = thresholdsSchema.parse(JSON.parse(raw))[suite];
  if (bounds === undefined) throw new Error(`no thresholds for suite ${suite}`);

  return bounds;
}

/** Every metric outside its bound, phrased for a CI log; an absent metric is a breach. */
export function breaches(suite: string, scores: Scores): string[] {
  return Object.entries(thresholdsOf(suite)).flatMap(([name, bound]) => {
    const value = scores[name];
    if (value === undefined || Number.isNaN(value)) return [`${name}: missing`];
    if (bound.min !== undefined && value < bound.min) return [`${name} ${value} < ${bound.min}`];
    if (bound.max !== undefined && value > bound.max) return [`${name} ${value} > ${bound.max}`];

    return [];
  });
}

/** How many runs the gate takes the median of; `EVAL_RUNS` lowers it for a quick local look. */
export function runCount(): number {
  return Number(process.env.EVAL_RUNS ?? 3);
}

/** The worst value of every metric over several runs, for a gate that tolerates no slip. */
export function worstScores(runs: readonly Scores[]): Scores {
  const names = [...new Set(runs.flatMap((run) => Object.keys(run)))];

  return Object.fromEntries(
    names.map((name) => [name, Math.max(...runs.map((run) => run[name] ?? Number.NaN))]),
  );
}

type Combine = typeof medianScores;

/** The combined runs on one line, for a log or a report. */
export function summary(label: string, runs: readonly Scores[], combine = medianScores): string {
  const rounded = Object.entries(combine(runs)).map(
    ([name, value]) => `${name} ${+value.toFixed(4)}`,
  );
  const how = combine === medianScores ? "median" : "worst";

  return `${label}, ${how} of ${runs.length} runs: ${rounded.join(" | ")}`;
}

/** Prints the combined runs, the bound breaches, and fails the process on any breach. */
export function report(suite: string, runs: readonly Scores[], combine: Combine = medianScores) {
  const failed = breaches(suite, combine(runs));

  console.log(`\n${summary(suite, runs, combine)}`);
  if (failed.length === 0) return;

  console.error(`${suite} below its thresholds: ${failed.join(", ")}`);
  process.exitCode = 1;
}
