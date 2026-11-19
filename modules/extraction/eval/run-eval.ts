import { readFileSync } from "node:fs";
import { Result } from "@packages/ddd-kit";
import type { ILanguageModel, ModelTier } from "@packages/llm/contract/language-model.port";
import { llmError } from "@packages/llm/contract/llm-error";
import {
  EvalInstrumentation,
  evalModel,
  mapBounded,
  RecordingCallLog,
  report,
  runCount,
  type Scores,
  summary,
} from "@packages/llm/eval/harness";
import { z } from "zod";
import { ExtractionService } from "../src/application/services/extraction.service";
import { AMENDMENT_KINDS } from "../src/domain/extracted-event";
import { extractionCategorySchema } from "../src/domain/value-objects/extraction-category.vo";
import { DATASET_ANNOUNCEMENTS } from "./classroom-dataset";

const SUITE = "announcement_extraction";
const EVAL_USER_ID = "eval";
const CONCURRENCY = 4;

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

interface CaseOutcome {
  expected: string[];
  predicted: string[];
  review: number;
  expectedAmends: string[];
  predictedAmends: string[];
  failed: boolean;
}

const SINGLE_TIER_ONLY = llmError("LLM_PROVIDER_FAILURE", "single tier evaluation");

function singleTier(tier: ModelTier, model: ILanguageModel): ILanguageModel {
  return {
    parse: async (request) =>
      request.tier === tier ? model.parse(request) : Result.fail(SINGLE_TIER_ONLY),
    streamParse: (request, observer) => model.streamParse(request, observer),
  };
}

const CONFIGURATIONS: Record<string, (model: ILanguageModel) => ILanguageModel> = {
  production: (model) => model,
  "haiku-only": (model) => singleTier("fast", model),
  "sonnet-only": (model) => ({
    parse: (request) => model.parse({ ...request, tier: "strong" }),
    streamParse: (request, observer) => model.streamParse(request, observer),
  }),
};

function loadCases(): EvalCase[] {
  const path = process.env.EVAL_SET;
  if (path === undefined) return DATASET_ANNOUNCEMENTS.map((item) => caseSchema.parse(item));

  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => caseSchema.parse(JSON.parse(line)));
}

function matches(expected: readonly string[], predicted: readonly string[]): number {
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

const ratio = (part: number, whole: number) => (whole === 0 ? 1 : part / whole);

async function runCase(service: ExtractionService, evalCase: EvalCase): Promise<CaseOutcome> {
  const result = await service.extract({
    userId: EVAL_USER_ID,
    text: evalCase.text,
    publishedAt: new Date(evalCase.publishedAt),
    childNames: evalCase.childName === undefined ? [] : [evalCase.childName],
  });
  const expected = evalCase.expected.map((event) => `${event.category} ${event.deadlineDate}`);
  const expectedAmends = evalCase.expectedAmends.map(amendKey);
  if (result.isFailure) {
    console.log(`  ${evalCase.id}: ${result.getError().code}`);
    return {
      expected,
      predicted: [],
      review: 0,
      expectedAmends,
      predictedAmends: [],
      failed: true,
    };
  }

  const { events, amendments } = result.getValue();
  const predicted = events.map((event) => `${event.category} ${event.deadlineDate}`);
  if (matches(expected, predicted) !== Math.max(expected.length, predicted.length))
    console.log(`  ${evalCase.id}: expected [${expected}] got [${predicted}]`);

  return {
    expected,
    predicted,
    review: events.filter((event) => event.needsReview).length,
    expectedAmends,
    predictedAmends: amendments.map(amendKey),
    failed: false,
  };
}

function scoresOf(outcomes: readonly CaseOutcome[], log: RecordingCallLog): Scores {
  const sum = (count: (outcome: CaseOutcome) => number) =>
    outcomes.reduce((total, outcome) => total + count(outcome), 0);
  const correct = sum((o) => matches(o.expected, o.predicted));
  const predicted = sum((o) => o.predicted.length);
  const amendsExpected = sum((o) => o.expectedAmends.length);

  return {
    precision: ratio(correct, predicted),
    recall: ratio(
      correct,
      sum((o) => o.expected.length),
    ),
    toReview: ratio(
      sum((o) => o.review),
      predicted,
    ),
    amendsRecall: ratio(
      sum((o) => matches(o.expectedAmends, o.predictedAmends)),
      amendsExpected,
    ),
    spuriousAmends: sum((o) =>
      o.expectedAmends.length === 0 && o.predictedAmends.length > 0 ? 1 : 0,
    ),
    failedCalls: sum((o) => (o.failed ? 1 : 0)),
    escalated: ratio(
      log.entries.filter((entry) => entry.model === "claude-sonnet-5-5").length,
      outcomes.length,
    ),
    costUsd: log.costUsd(),
    maxOutputTokens: log.maxOutputTokens(),
  };
}

async function runOnce(configuration: string, cases: readonly EvalCase[]): Promise<Scores> {
  const wrap = CONFIGURATIONS[configuration];
  if (wrap === undefined) throw new Error(`unknown configuration ${configuration}`);

  const log = new RecordingCallLog();
  const service = new ExtractionService(wrap(evalModel(log)), new EvalInstrumentation());
  const outcomes = await mapBounded(cases, CONCURRENCY, (evalCase) => runCase(service, evalCase));

  return scoresOf(outcomes, log);
}

const configuration = process.env.EVAL_CONFIG ?? "production";
const cases = loadCases();
const runs: Scores[] = [];
for (let run = 1; run <= runCount(); run += 1) {
  console.log(`\n${configuration}, run ${run}`);
  runs.push(await runOnce(configuration, cases));
}

if (configuration === "production") report(SUITE, runs);
else console.log(`\n${summary(`${SUITE}, ${configuration} (not gated)`, runs)}`);
