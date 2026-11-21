import { wallDateLabel } from "@packages/i18n";
import type { ParseKeys, TFunction } from "i18next";
import type { ChildCount } from "../../shared/agenda/views";
import { inSentence, wallDateParts } from "../../shared/format/deadline-label";
import type { AdviceContext, AdviceHoliday } from "./advise-context";

export interface HeroSummaryInput {
  context: AdviceContext;
  holiday: AdviceHoliday | null;
  perChild: readonly ChildCount[];
  week: { count: number; until: string };
}

export interface HeroSummaryPart {
  key: ParseKeys<"home">;
  values: Record<string, unknown>;
}

type HeroSummary = readonly HeroSummaryPart[];

const SEPARATOR_KEY = "hero.summary.separator";

export function heroSummaryOf({ context, holiday, perChild, week }: HeroSummaryInput): HeroSummary {
  if (holiday && context.holiday === "during") return [holidayPart(holiday)];
  if (context.data === "calm") return [calmPart(week)];

  const counted = perChild.filter(({ count }) => count > 0);
  if (counted.length === 0) return [];
  if (context.children !== "2-3") return [familyPart(counted)];

  return counted.map(childPart);
}

export function sayHeroSummary(t: TFunction<"home">, summary: HeroSummary): string | undefined {
  if (summary.length === 0) return undefined;

  return summary.map(({ key, values }) => t(key, values)).join(t(SEPARATOR_KEY));
}

function holidayPart({ name, endsOn }: AdviceHoliday): HeroSummaryPart {
  return { key: "hero.summary.holiday", values: { name, date: wallDateLabel(endsOn, endsOn) } };
}

function calmPart({ count, until }: HeroSummaryInput["week"]): HeroSummaryPart {
  const day = inSentence(wallDateParts(until).weekdayLong);

  return { key: "hero.summary.calm", values: { count, day } };
}

function familyPart(counted: readonly ChildCount[]): HeroSummaryPart {
  const count = counted.reduce((total, child) => total + child.count, 0);

  return { key: "hero.summary.family", values: { count } };
}

function childPart({ label, count }: ChildCount, index: number): HeroSummaryPart {
  const key = index === 0 ? "hero.summary.firstChild" : "hero.summary.nextChild";

  return { key, values: { count, name: label } };
}
