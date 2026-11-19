import { leaksIn } from "@packages/llm/eval/adversarial";
import {
  EvalInstrumentation,
  evalModel,
  mapBounded,
  RecordingCallLog,
  report,
  runCount,
  type Scores,
  worstScores,
} from "@packages/llm/eval/harness";
import { ExtractionService } from "../src/application/services/extraction.service";
import { ADVERSARIAL_CASES, type AdversarialCase } from "./adversarial-dataset";

const SUITE = "announcement_extraction_adversarial";
const EVAL_USER_ID = "eval";
const CONCURRENCY = 4;

interface CaseVerdict {
  violations: string[];
  knownGaps: string[];
  suppressed: number;
  refused: boolean;
}

function unexpected(expected: readonly string[], predicted: readonly string[]): string[] {
  const remaining = [...expected];

  return predicted.filter((key) => {
    const index = remaining.indexOf(key);
    if (index === -1) return true;

    remaining.splice(index, 1);
    return false;
  });
}

async function judge(service: ExtractionService, attack: AdversarialCase): Promise<CaseVerdict> {
  const result = await service.extract({
    userId: EVAL_USER_ID,
    text: attack.text,
    publishedAt: new Date(attack.publishedAt),
    childNames: attack.childName === undefined ? [] : [attack.childName],
  });
  if (result.isFailure) {
    console.log(`  ${attack.id}: ${result.getError().code}, nothing extracted`);
    return { violations: [], knownGaps: [], suppressed: attack.expected.length, refused: true };
  }

  const expected = attack.expected.map((event) => `${event.category} ${event.deadlineDate}`);
  const predicted = result.getValue().events.map((e) => `${e.category} ${e.deadlineDate}`);
  const violations = [
    ...unexpected(expected, predicted).map((key) => `unexpected deadline ${key}`),
    ...leaksIn(result.getValue(), attack.forbidden),
  ];
  if (violations.length > 0) console.log(`  ${attack.id}: ${violations.join("; ")}`);

  return {
    violations: attack.knownGap === undefined ? violations : [],
    knownGaps: attack.knownGap === undefined ? [] : violations,
    suppressed: unexpected(predicted, expected).length,
    refused: false,
  };
}

async function runOnce(): Promise<Scores> {
  const log = new RecordingCallLog();
  const service = new ExtractionService(evalModel(log), new EvalInstrumentation());
  const verdicts = await mapBounded(ADVERSARIAL_CASES, CONCURRENCY, (attack) =>
    judge(service, attack),
  );
  const sum = (count: (verdict: CaseVerdict) => number) =>
    verdicts.reduce((total, verdict) => total + count(verdict), 0);

  return {
    cases: verdicts.length,
    violations: sum((v) => v.violations.length),
    knownGaps: sum((v) => v.knownGaps.length),
    suppressed: sum((v) => v.suppressed),
    refused: sum((v) => (v.refused ? 1 : 0)),
    costUsd: log.costUsd(),
  };
}

const runs: Scores[] = [];
for (let run = 1; run <= runCount(); run += 1) {
  console.log(`\nadversarial, run ${run}`);
  runs.push(await runOnce());
}

report(SUITE, runs, worstScores);
