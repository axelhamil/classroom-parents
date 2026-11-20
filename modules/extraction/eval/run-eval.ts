import { readFileSync } from "node:fs";
import { Result } from "@packages/ddd-kit";
import {
  ACTION_CURRENCIES,
  PARENT_ACTION_KINDS,
  REVIEW_REASONS,
} from "@packages/events/agenda-contract";
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
import { withoutMarks } from "../src/application/services/calendar-words";
import { mayHoldADeadline } from "../src/application/services/date-signal";
import { ExtractionService } from "../src/application/services/extraction.service";
import { AMENDMENT_KINDS, type ExtractedEvent } from "../src/domain/extracted-event";
import { READER_LOCALES } from "../src/domain/reader";
import { extractionCategorySchema } from "../src/domain/value-objects/extraction-category.vo";
import { DATASET_ANNOUNCEMENTS } from "./classroom-dataset";
import { MULTILINGUAL_CASES } from "./multilingual-dataset";
import { NO_SHARED_CACHE } from "./no-shared-cache";
import {
  DATASET_PREPARATION,
  type ExpectedPreparation,
  PREPARATION_CASES,
} from "./preparation-dataset";

const SUITE = "announcement_extraction";
const EVAL_USER_ID = "eval";
const CONCURRENCY = 4;

const LANGUAGES = ["fr", "ar", "pt", "en", "es", "mixed"] as const;

const caseSchema = z.object({
  id: z.string(),
  language: z.enum(LANGUAGES).default("fr"),
  publishedAt: z.iso.datetime({ offset: true }),
  timeZone: z.string().default("Europe/Paris"),
  country: z.string().nullable().default("FR"),
  outputLocale: z.enum(READER_LOCALES).default("fr"),
  text: z.string(),
  childName: z.string().optional(),
  expected: z.array(
    z.object({
      category: extractionCategorySchema,
      deadlineDate: z.iso.date(),
      alsoAccepted: z.iso.date().optional(),
    }),
  ),
  expectedReasons: z.array(z.enum(REVIEW_REASONS)).default([]),
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
  language: EvalCase["language"];
  expected: string[][];
  predicted: string[];
  review: number;
  expectedAmends: string[];
  predictedAmends: string[];
  failed: boolean;
  sent: boolean;
  preparation: PreparationOutcome;
  reasonsExpected: number;
  reasonsFound: number;
  wrongScriptTitles: number;
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
    ...MULTILINGUAL_CASES,
  ].map((item) => caseSchema.parse(item));
}

function selectedLanguages(cases: EvalCase[]): EvalCase[] {
  const wanted = process.env.EVAL_LANGUAGES?.split(",");
  if (wanted === undefined) return cases;

  return cases.filter((evalCase) => wanted.includes(evalCase.language));
}

function loadCases(): EvalCase[] {
  const path = process.env.EVAL_SET;
  if (path === undefined) return selectedLanguages(defaultCases());

  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => caseSchema.parse(JSON.parse(line)));
}

function matches(expected: readonly string[][], predicted: readonly string[]): number {
  const remaining = [...expected];

  return predicted.filter((key) => {
    const index = remaining.findIndex((accepted) => accepted.includes(key));
    if (index === -1) return false;

    remaining.splice(index, 1);
    return true;
  }).length;
}

const ARABIC_LETTER = /\p{Script=Arabic}/u;

function wrongScriptTitles(events: readonly ExtractedEvent[], locale: EvalCase["outputLocale"]) {
  return events.filter(({ title }) => ARABIC_LETTER.test(title) !== (locale === "ar")).length;
}

function expectedKeys(evalCase: EvalCase): string[][] {
  return evalCase.expected.map(({ category, deadlineDate, alsoAccepted }) => [
    `${category} ${deadlineDate}`,
    ...(alsoAccepted === undefined ? [] : [`${category} ${alsoAccepted}`]),
  ]);
}

function reasonsFoundIn(events: readonly ExtractedEvent[], evalCase: EvalCase): number {
  return evalCase.expectedReasons.filter((reason) =>
    events.some((event) => event.reviewReasons.includes(reason)),
  ).length;
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
  evalCase: EvalCase,
  events: readonly ExtractedEvent[],
  expected: ExpectedPreparation | undefined,
): PreparationOutcome {
  const actions = events.flatMap((event) => event.parentActions);
  const items = events.flatMap((event) => event.toBring).map(({ item }) => folded(item));
  const writtenInTheParentsLanguage = evalCase.language === evalCase.outputLocale;
  const inventedItems = writtenInTheParentsLanguage
    ? items.filter((item) => !folded(evalCase.text).includes(item)).length
    : 0;
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
    reader: {
      locale: evalCase.outputLocale,
      timeZone: evalCase.timeZone,
      country: evalCase.country,
    },
    childNames,
  });
  const expected = expectedKeys(evalCase);
  const expectedAmends = evalCase.expectedAmends.map(amendKey);
  const outcome = {
    language: evalCase.language,
    expected,
    expectedAmends,
    sent,
    reasonsExpected: evalCase.expectedReasons.length,
  };
  if (result.isFailure) {
    console.log(`  ${evalCase.id}: ${result.getError().code}`);
    return {
      ...outcome,
      predicted: [],
      review: 0,
      predictedAmends: [],
      failed: true,
      preparation: preparationOutcome(evalCase, [], evalCase.preparation),
      reasonsFound: 0,
      wrongScriptTitles: 0,
    };
  }

  const { events, amendments } = result.getValue();
  const predicted = events.map((event) => `${event.category} ${event.deadlineDate}`);
  if (matches(expected, predicted) !== Math.max(expected.length, predicted.length))
    console.log(`  ${evalCase.id}: expected [${expected}] got [${predicted}]`);

  return {
    ...outcome,
    predicted,
    review: events.filter((event) => event.needsReview).length,
    predictedAmends: amendments.map(amendKey),
    failed: false,
    preparation: preparationOutcome(evalCase, events, evalCase.preparation),
    reasonsFound: reasonsFoundIn(events, evalCase),
    wrongScriptTitles: wrongScriptTitles(events, evalCase.outputLocale),
  };
}

function scoresOf(outcomes: readonly CaseOutcome[], log: RecordingCallLog): Scores {
  const sum = (count: (outcome: CaseOutcome) => number) =>
    outcomes.reduce((total, outcome) => total + count(outcome), 0);
  const correct = sum((o) => matches(o.expected, o.predicted));
  const predicted = sum((o) => o.predicted.length);
  const amendsExpected = sum((o) => o.expectedAmends.length);
  const sent = sum((o) => (o.sent ? 1 : 0));
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
      sum((o) =>
        matches(
          o.expectedAmends.map((key) => [key]),
          o.predictedAmends,
        ),
      ),
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
    reasonsFlagged: ratio(
      sum((o) => o.reasonsFound),
      sum((o) => o.reasonsExpected),
    ),
    wrongScriptTitles: sum((o) => o.wrongScriptTitles),
    ...costPerFamily(log, sent),
  };
}

const SENT_ANNOUNCEMENTS_PER_FAMILY_MONTH = 36;

function costPerFamily(log: RecordingCallLog, sent: number): Scores {
  const calls = log.entries.length;
  const tokens = (count: (entry: RecordingCallLog["entries"][number]) => number) =>
    ratio(
      log.entries.reduce((total, entry) => total + count(entry), 0),
      calls,
    );
  const costPerSent = ratio(log.costUsd(), sent);

  return {
    inputTokensPerCall: tokens((entry) => entry.inputTokens),
    cacheReadTokensPerCall: tokens((entry) => entry.cacheReadTokens),
    outputTokensPerCall: tokens((entry) => entry.outputTokens),
    costPerSentAnnouncementUsd: costPerSent,
    familyMonthUsd: costPerSent * SENT_ANNOUNCEMENTS_PER_FAMILY_MONTH,
  };
}

function byLanguage(outcomes: readonly CaseOutcome[], logs: Map<string, RecordingCallLog>) {
  return LANGUAGES.flatMap((language) => {
    const own = outcomes.filter((outcome) => outcome.language === language);
    const log = logs.get(language);
    if (own.length === 0 || log === undefined) return [];

    const scores = scoresOf(own, log);
    const kept = [
      "precision",
      "recall",
      "toReview",
      "failedCalls",
      "prefilterMissed",
      "wrongScriptTitles",
      "costUsd",
      "familyMonthUsd",
    ];

    return kept.map((name) => [`${name}_${language}`, scores[name] ?? Number.NaN] as const);
  });
}

function mergedLog(logs: Iterable<RecordingCallLog>): RecordingCallLog {
  const merged = new RecordingCallLog();
  for (const log of logs) merged.entries.push(...log.entries);

  return merged;
}

async function runOnce(configuration: string, cases: readonly EvalCase[]): Promise<Scores> {
  const wrap = CONFIGURATIONS[configuration];
  if (wrap === undefined) throw new Error(`unknown configuration ${configuration}`);

  const logs = new Map(LANGUAGES.map((language) => [language, new RecordingCallLog()]));
  const services = new Map(
    [...logs].map(([language, log]) => [
      language,
      new ExtractionService(wrap(evalModel(log)), NO_SHARED_CACHE, new EvalInstrumentation()),
    ]),
  );
  const outcomes = await mapBounded(cases, CONCURRENCY, (evalCase) => {
    const service = services.get(evalCase.language);
    if (service === undefined) throw new Error(`no service for ${evalCase.language}`);

    return runCase(service, evalCase);
  });

  return {
    ...scoresOf(outcomes, mergedLog(logs.values())),
    ...Object.fromEntries(byLanguage(outcomes, logs)),
  };
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
