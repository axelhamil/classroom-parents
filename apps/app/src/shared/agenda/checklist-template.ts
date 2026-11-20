import type { EventItem } from "../api/queries/events";
import type { EventCategory } from "../events/event-labels";

export const CHECKLIST_DEFAULTS = {
  swimming: [
    "prepare.items.swimming.swimsuit",
    "prepare.items.swimming.cap",
    "prepare.items.swimming.towel",
    "prepare.items.swimming.showerGel",
  ],
  school_trip: [
    "prepare.items.school_trip.lunch",
    "prepare.items.school_trip.outfit",
    "prepare.items.school_trip.permission",
  ],
  document_due: ["prepare.items.document_due.sign", "prepare.items.document_due.pack"],
  assessment: ["prepare.items.assessment.revise"],
  homework: ["prepare.items.homework.check"],
  other: [],
} as const satisfies Record<EventCategory, readonly string[]>;

type StepsOf = Pick<EventItem, "category" | "checklist" | "preparation">;

type Preparation = NonNullable<EventItem["preparation"]>;

type ParentAction = Preparation["parentActions"][number];

/**
 * One thing the announcement asks, as a step the parent ticks. Its id comes from what it asks, never
 * from its place in the reading: a reread that reorders the steps keeps every tick on its step, a
 * step that disappears leaves its tick unused, a reworded step starts unticked.
 */
export interface AskedStep {
  id: string;
  label: string;
  amountCents: number | null;
  currency: ParentAction["currency"];
  quote: string;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function normalized(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function fingerprint(text: string): string {
  let hash = FNV_OFFSET;
  for (const char of text) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), FNV_PRIME);

  return (hash >>> 0).toString(36);
}

function stepId(kind: string, ...content: readonly (string | number | null)[]): string {
  return `asked.${kind}.${fingerprint(normalized(content.join(" ")))}`;
}

function actionSteps({ parentActions }: Preparation): AskedStep[] {
  return parentActions.map(({ kind, label, amountCents, currency, quote }) => ({
    id: stepId(kind, label, amountCents, currency),
    label,
    amountCents,
    currency,
    quote,
  }));
}

function bringSteps({ toBring }: Preparation): AskedStep[] {
  return toBring.map(({ item, quote }) => ({
    id: stepId("bring", item),
    label: item,
    amountCents: null,
    currency: null,
    quote,
  }));
}

export function askedStepsOf({ preparation }: Pick<EventItem, "preparation">): AskedStep[] {
  if (!preparation) return [];

  const steps = [...actionSteps(preparation), ...bringSteps(preparation)];

  return [...new Map(steps.map((step) => [step.id, step])).values()];
}

type TemplateStep = (typeof CHECKLIST_DEFAULTS)[EventCategory][number];

/** The template steps of the category the parent kept: suggestions, never what the school asks. */
export function suggestedStepIdsOf({ category, checklist }: StepsOf): TemplateStep[] {
  return CHECKLIST_DEFAULTS[category].filter((key) => !checklist.removed.includes(key));
}

function stepIdsToPrepare(event: StepsOf): string[] {
  const asked = askedStepsOf(event).map((step) => step.id);

  return [...asked, ...event.checklist.extra.map((item) => item.id)];
}

const isOpenIn =
  ({ checklist }: StepsOf) =>
  (id: string) =>
    !checklist.done.includes(id);

/** An open step the announcement asks or the parent added: what is really left to prepare. */
export function hasOpenStepsToPrepare(event: StepsOf): boolean {
  return stepIdsToPrepare(event).some(isOpenIn(event));
}

/** Any open step, suggestions included. */
export function hasOpenSteps(event: StepsOf): boolean {
  return [...stepIdsToPrepare(event), ...suggestedStepIdsOf(event)].some(isOpenIn(event));
}
