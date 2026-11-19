import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../shared/api/queries/children";
import type { DashboardBlock } from "../../shared/dashboard/dashboard-block";
import type { HomeBlock } from "../../shared/dashboard/dashboard-layout";
import { assessmentsBlock } from "./components/blocks/assessments-block";
import { calendarBlock } from "./components/blocks/calendar-block";
import { childBlock } from "./components/blocks/child-block";
import { documentsBlock } from "./components/blocks/documents-block";
import { notesBlock } from "./components/blocks/notes-block";
import { outingsBlock } from "./components/blocks/outings-block";
import { overdueBlock } from "./components/blocks/overdue-block";
import { progressBlock } from "./components/blocks/progress-block";
import { remindersBlock } from "./components/blocks/reminders-block";
import { reviewBlock } from "./components/blocks/review-block";
import { todayBlock } from "./components/blocks/today-block";
import { tonightBlock } from "./components/blocks/tonight-block";
import { workloadBlock } from "./components/blocks/workload-block";
import type { HomeBlockContext, HomeBlockDefinition } from "./home-block";

/** Every block the home offers, in the order the drawer lists them. A new block is one line here. */
const HOME_BLOCKS: readonly HomeBlockDefinition[] = [
  todayBlock,
  tonightBlock,
  reviewBlock,
  calendarBlock,
  overdueBlock,
  assessmentsBlock,
  documentsBlock,
  notesBlock,
  outingsBlock,
  workloadBlock,
  progressBlock,
  remindersBlock,
];

/**
 * Phone first, for a parent of two: what is due, what to pack tonight, what to
 * check, the week. On a wide screen the day takes two thirds and two steps, so
 * tonight and the dates to check stack beside it, and the week gets the whole
 * width under them: rows sized by their content then meet without holes.
 */
const DEFAULT_LAYOUT: readonly HomeBlock[] = [
  { id: "today", w: 8, h: 2, hidden: false },
  { id: "tonight", w: 4, h: 1, hidden: false },
  { id: "review", w: 4, h: 1, hidden: false },
  { id: "calendar", w: 12, h: 3, hidden: false },
  { id: "overdue", w: 4, h: 1, hidden: false },
  { id: "assessments", w: 4, h: 1, hidden: false },
  { id: "documents", w: 4, h: 1, hidden: false },
  { id: "notes", w: 4, h: 1, hidden: false },
];

export interface HomeRegistry {
  blocks: DashboardBlock<HomeBlockContext>[];
  defaults: readonly HomeBlock[];
}

export function useHomeRegistry(family: readonly ChildDto[]): HomeRegistry {
  const { t } = useTranslation("home");
  const shared = HOME_BLOCKS.map(({ titleKey, descriptionKey, ...block }) => ({
    ...block,
    title: t(titleKey),
    description: t(descriptionKey),
  }));
  const perChild = family.map((child) =>
    childBlock(child, t("blocks.child.description", { child: child.label })),
  );

  return { blocks: [...shared, ...perChild], defaults: DEFAULT_LAYOUT };
}
