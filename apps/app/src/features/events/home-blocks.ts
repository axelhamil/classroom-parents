import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { nextSevenDays } from "../../shared/agenda/windows";
import type { ChildDto } from "../../shared/api/queries/children";
import type { DashboardBlock } from "../../shared/dashboard/dashboard-block";
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
import { blockSizesOf } from "./home-block-sizes";

export type RegisteredBlock = DashboardBlock<HomeBlockContext>;

export type UnsizedBlock = Omit<RegisteredBlock, "sizes">;

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

function sized(block: UnsizedBlock): RegisteredBlock[] {
  const sizes = blockSizesOf(block.id);

  return sizes ? [{ ...block, sizes }] : [];
}

export function useHomeRegistry(family: readonly ChildDto[]): RegisteredBlock[] {
  const { t } = useTranslation("home");

  return useMemo(() => {
    const shared = HOME_BLOCKS.map(({ titleKey, descriptionKey, windowDays, ...block }) => ({
      ...block,
      title: t(titleKey),
      description: t(descriptionKey, { days: windowDays }),
    }));
    const perChild = family.map((child) =>
      childBlock(
        child,
        t("blocks.child.description", { child: child.label, days: nextSevenDays.days }),
      ),
    );

    return [...shared, ...perChild].flatMap(sized);
  }, [t, family]);
}
