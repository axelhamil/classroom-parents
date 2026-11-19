import { readFileSync } from "node:fs";
import { Result } from "@packages/ddd-kit";
import { ACTION_CURRENCIES, PARENT_ACTION_KINDS } from "@packages/events/agenda-contract";
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
import { sanitizeAnnouncement } from "../src/application/services/announcement-sanitizer";
import { mayHoldADeadline } from "../src/application/services/date-signal";
import { ExtractionService } from "../src/application/services/extraction.service";
import { withoutMarks } from "../src/application/services/french-calendar";
import { AMENDMENT_KINDS, type ExtractedEvent } from "../src/domain/extracted-event";
import { extractionCategorySchema } from "../src/domain/value-objects/extraction-category.vo";
import { DATASET_ANNOUNCEMENTS } from "./classroom-dataset";
import { NO_SHARED_CACHE } from "./no-shared-cache";
import {
  DATASET_PREPARATION,
  type ExpectedPreparation,
  PREPARATION_CASES,
} from "./preparation-dataset";

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
  preparation: z
    .object({
      actions: z.array(
        z.object({
          kind: z.enum(PARENT_ACTION_KINDS),
          amountCents: z.number().optional(),
          currency: z.enum(ACTION_CURRENCIES).optional(),
        }),
      ),
      toBring: z.array(z.string()),
    })
    .optional(),
});

type EvalCase = z.infer<typeof caseSchema>;

interface CaseOutcome {
  expected: string[];
  predicted: string[];
  review: number;
  expectedAmends: string[];
  predictedAmends: string[];
  failed: boolean;
  sent: boolean;
  preparation: PreparationOutcome;
}

interface PreparationOutcome {
  actionsExpected: number;
  actionsFound: number;
  wrongAmounts: number;
  itemsExpected: number;
  itemsFound: number;
  inventedItems: number;
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

function defaultCases(): EvalCase[] {
  return [
    ...DATASET_ANNOUNCEMENTS.map((item) => ({
      ...item,
      preparation: DATASET_PREPARATION[item.id],
    })),
    ...PREPARATION_CASES,
  ].map((item) => caseSchema.parse(item));
}

function loadCases(): EvalCase[] {
  const path = process.env.EVAL_SET;
  if (path === undefined) return defaultCases();

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

const folded = (text: string) => withoutMarks(text.toLowerCase());

const NO_PREPARATION: PreparationOutcome = {
  actionsExpected: 0,
  actionsFound: 0,
  wrongAmounts: 0,
  itemsExpected: 0,
  itemsFound: 0,
  inventedItems: 0,
};

function preparationOutcome(
  text: string,
  events: readonly ExtractedEvent[],
  expected: ExpectedPreparation | undefined,
): PreparationOutcome {
  const actions = events.flatMap((event) => event.parentActions);
  const items = events.flatMap((event) => event.toBring).map(({ item }) => folded(item));
  const inventedItems = items.filter((item) => !folded(text).includes(item)).length;
  if (expected === undefined) return { ...NO_PREPARATION, inventedItems };

  const amounts = expected.actions.flatMap(({ amountCents }) => amountCents ?? []);

  return {
    actionsExpected: expected.actions.length,
    actionsFound: expected.actions.filter((wanted) =>
      actions.some(
        (action) =>
          action.kind === wanted.kind &&
          (wanted.amountCents === undefined ||
            (action.amountCents === wanted.amountCents && action.currency === wanted.currency)),
      ),
    ).length,
    wrongAmounts: actions.filter(
      ({ amountCents }) => amountCents !== null && !amounts.includes(amountCents),
    ).length,
    itemsExpected: expected.toBring.length,
    itemsFound: expected.toBring.filter((word) => items.some((item) => item.includes(folded(word))))
      .length,
    inventedItems,
  };
}

async function runCase(service: ExtractionService, evalCase: EvalCase): Promise<CaseOutcome> {
  const childNames = evalCase.childName === undefined ? [] : [evalCase.childName];
  const sent = mayHoldADeadline(sanitizeAnnouncement(evalCase.text, childNames));
  const result = await service.extract({
    userId: EVAL_USER_ID,
    announcementId: evalCase.id,
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
      sent,
      preparation: preparationOutcome(evalCase.text, [], evalCase.preparation),
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
    sent,
    preparation: preparationOutcome(evalCase.text, events, evalCase.preparation),
  };
}

function scoresOf(outcomes: readonly CaseOutcome[], log: RecordingCallLog): Scores {
  const sum = (count: (outcome: CaseOutcome) => number) =>
    outcomes.reduce((total, outcome) => total + count(outcome), 0);
  const correct = sum((o) => matches(o.expected, o.predicted));
  const predicted = sum((o) => o.predicted.length);
  const amendsExpected = sum((o) => o.expectedAmends.length);
  const prepared = (count: (outcome: PreparationOutcome) => number) =>
    sum((o) => count(o.preparation));

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
    skipped: ratio(
      sum((o) => (o.sent ? 0 : 1)),
      outcomes.length,
    ),
    prefilterMissed: sum((o) => (o.sent ? 0 : o.expected.length)),
    actionsRecall: ratio(
      prepared((p) => p.actionsFound),
      prepared((p) => p.actionsExpected),
    ),
    wrongAmounts: prepared((p) => p.wrongAmounts),
    toBringRecall: ratio(
      prepared((p) => p.itemsFound),
      prepared((p) => p.itemsExpected),
    ),
    inventedItems: prepared((p) => p.inventedItems),
  };
}

async function runOnce(configuration: string, cases: readonly EvalCase[]): Promise<Scores> {
  const wrap = CONFIGURATIONS[configuration];
  if (wrap === undefined) throw new Error(`unknown configuration ${configuration}`);

  const log = new RecordingCallLog();
  const service = new ExtractionService(
    wrap(evalModel(log)),
    NO_SHARED_CACHE,
    new EvalInstrumentation(),
  );
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
