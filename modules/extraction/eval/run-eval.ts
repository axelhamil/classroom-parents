import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import {
  type Breadcrumb,
  type IInstrumentation,
  Result,
  type SpanOptions,
} from "@packages/ddd-kit";
import { z } from "zod";
import type { ILanguageModel, ModelTier } from "../src/application/ports/language-model.port";
import { ExtractionService } from "../src/application/services/extraction.service";
import { AMENDMENT_KINDS } from "../src/domain/extracted-event";
import { extractionCategorySchema } from "../src/domain/value-objects/extraction-category.vo";
import { AnthropicLanguageModel } from "../src/infrastructure/adapters/anthropic-language-model";
import { DATASET_ANNOUNCEMENTS } from "./classroom-dataset";

const caseSchema = z.object({
  id: z.string(),
  publishedAt: z.iso.datetime({ offset: true }),
  text: z.string(),
  childName: z.string().optional(),
  expected: z.array(z.object({ category: extractionCategorySchema, deadlineDate: z.iso.date() })),
  expectedAmends: z
    .array(z.object({ kind: z.enum(AMENDMENT_KINDS), referenceDate: z.iso.date().optional() }))
    .default([]),
});

type EvalCase = z.infer<typeof caseSchema>;

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const PRICE_PER_MTOK: Record<string, Usage> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};

class UsageRecorder implements IInstrumentation {
  readonly usageByModel = new Map<string, Usage>();
  private currentModel = "unknown";

  startSpan<T>(options: SpanOptions, callback: () => T): T {
    const model = options.attributes?.model;
    if (typeof model === "string") this.currentModel = model;

    return callback();
  }

  capture(error: unknown): void {
    console.error(`  provider error: ${error instanceof Error ? error.name : "unknown"}`);
  }

  addBreadcrumb(_crumb: Breadcrumb): void {}

  setSpanAttributes(attributes: Record<string, string | number | boolean>): void {
    const usage = this.usageByModel.get(this.currentModel) ?? {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    };
    const tokens = (key: string) => Number(attributes[key] ?? 0);

    this.usageByModel.set(this.currentModel, {
      input: usage.input + tokens("llm.input_tokens"),
      output: usage.output + tokens("llm.output_tokens"),
      cacheRead: usage.cacheRead + tokens("llm.cache_read_input_tokens"),
      cacheWrite: usage.cacheWrite + tokens("llm.cache_creation_input_tokens"),
    });
  }

  async flush(): Promise<boolean> {
    return true;
  }

  costInDollars(): number {
    return [...this.usageByModel].reduce((total, [model, usage]) => {
      const price = PRICE_PER_MTOK[model];
      if (!price) return total;

      const perToken =
        usage.input * price.input +
        usage.output * price.output +
        usage.cacheRead * price.cacheRead +
        usage.cacheWrite * price.cacheWrite;

      return total + perToken / 1_000_000;
    }, 0);
  }
}

const NO_SECOND_PASS = {
  code: "EXTRACTION_PROVIDER_FAILURE",
  message: "single tier evaluation",
} as const;

function singleTier(tier: ModelTier, model: ILanguageModel): ILanguageModel {
  return {
    parse: async (request) =>
      request.tier === "strong" ? Result.fail(NO_SECOND_PASS) : model.parse({ ...request, tier }),
  };
}

const CONFIGURATIONS: { name: string; wrap: (model: ILanguageModel) => ILanguageModel }[] = [
  { name: "haiku only", wrap: (model) => singleTier("fast", model) },
  { name: "haiku, sonnet on doubt", wrap: (model) => model },
  { name: "sonnet only", wrap: (model) => singleTier("strong", model) },
];

function countingEscalations(
  model: ILanguageModel,
  counter: { escalations: number },
): ILanguageModel {
  return {
    parse: (request) => {
      if (request.tier === "strong") counter.escalations += 1;

      return model.parse(request);
    },
  };
}

function loadCases(): EvalCase[] {
  const path = process.env.EVAL_SET;
  if (path === undefined) return DATASET_ANNOUNCEMENTS.map((item) => caseSchema.parse(item));

  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => caseSchema.parse(JSON.parse(line)));
}

function matches(expected: string[], predicted: string[]): number {
  const remaining = [...expected];

  return predicted.filter((key) => {
    const index = remaining.indexOf(key);
    if (index === -1) return false;

    remaining.splice(index, 1);
    return true;
  }).length;
}

const amendKey = (amend: { kind: string; referenceDate?: string }) =>
  `${amend.kind} ${amend.referenceDate ?? "undated"}`;

const percent = (part: number, whole: number) =>
  whole === 0 ? "n/a" : `${((100 * part) / whole).toFixed(1)} %`;

async function evaluate(
  name: string,
  cases: EvalCase[],
  wrap: (m: ILanguageModel) => ILanguageModel,
) {
  const recorder = new UsageRecorder();
  const counter = { escalations: 0 };
  const service = new ExtractionService(
    countingEscalations(
      wrap(new AnthropicLanguageModel(new Anthropic({ timeout: 60_000 }), recorder)),
      counter,
    ),
    recorder,
  );
  const totals = { expected: 0, predicted: 0, correct: 0, review: 0, failures: 0 };
  const amends = { expected: 0, predicted: 0, correct: 0 };

  console.log(`\n${name}`);
  for (const evalCase of cases) {
    const result = await service.extract({
      text: evalCase.text,
      publishedAt: new Date(evalCase.publishedAt),
      childNames: evalCase.childName === undefined ? [] : [evalCase.childName],
    });
    const expected = evalCase.expected.map((event) => `${event.category} ${event.deadlineDate}`);
    totals.expected += expected.length;

    if (result.isFailure) {
      totals.failures += 1;
      console.log(`  ${evalCase.id}: ${result.getError().code}`);
      continue;
    }

    const { events, amendments } = result.getValue();
    const predicted = events.map((event) => `${event.category} ${event.deadlineDate}`);
    const correct = matches(expected, predicted);
    totals.predicted += predicted.length;
    totals.correct += correct;
    totals.review += events.filter((event) => event.needsReview).length;

    if (correct !== expected.length || correct !== predicted.length)
      console.log(
        `  ${evalCase.id}: expected [${expected.join(", ")}] got [${predicted.join(", ")}]`,
      );

    const expectedAmends = evalCase.expectedAmends.map(amendKey);
    const predictedAmends = amendments.map(amendKey);
    const correctAmends = matches(expectedAmends, predictedAmends);
    amends.expected += expectedAmends.length;
    amends.predicted += predictedAmends.length;
    amends.correct += correctAmends;
    if (correctAmends !== expectedAmends.length || correctAmends !== predictedAmends.length)
      console.log(
        `  ${evalCase.id}: amends expected [${expectedAmends.join(", ")}] got [${predictedAmends.join(", ")}]`,
      );
  }

  console.log(
    [
      `  precision ${percent(totals.correct, totals.predicted)}`,
      `recall ${percent(totals.correct, totals.expected)}`,
      `to review ${percent(totals.review, totals.predicted)}`,
      `amends precision ${percent(amends.correct, amends.predicted)}`,
      `amends recall ${percent(amends.correct, amends.expected)}`,
      `failed calls ${totals.failures}`,
      `escalation requested ${percent(counter.escalations, cases.length)}`,
      `cost $${recorder.costInDollars().toFixed(4)} for ${cases.length} announcements`,
    ].join(" | "),
  );
}

const cases = loadCases();
for (const configuration of CONFIGURATIONS) {
  await evaluate(configuration.name, cases, configuration.wrap);
}
