import { mondayOf, shiftDate } from "@packages/ddd-kit/days";
import { Progress } from "@packages/ui/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import { CheckCheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { schoolToday } from "../../../../shared/format/school-today";
import { calendarEventsQueryOptions } from "../../api/events.queries";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { WEEK_LENGTH } from "../../week";
import { BlockPanel } from "./block-panel";
import { forChild } from "./event-rows";

function thisWeek(today: string) {
  const monday = mondayOf(today);

  return { from: monday, to: shiftDate(monday, WEEK_LENGTH - 1) };
}

function ProgressBlock({ childId, now, title }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const query = useQuery(calendarEventsQueryOptions(thisWeek(schoolToday(now))));
  const week = forChild(query.data ?? [], childId);
  const done = week.filter((event) => event.done).length;
  const total = week.length;
  const counts = { done, total };
  const summary =
    total > 0 && done === total
      ? t("blocks.progress.allDone")
      : t("blocks.progress.summary", counts);

  return (
    <BlockPanel
      title={title}
      icon={CheckCheckIcon}
      note={query.isSuccess && (total === 0 ? t("blocks.progress.empty") : summary)}
    >
      {total > 0 && (
        <Progress
          value={done}
          max={total}
          tone={done === total ? "success" : "ink"}
          aria-label={t("blocks.progress.label", counts)}
        />
      )}
    </BlockPanel>
  );
}

export const progressBlock: HomeBlockDefinition = {
  id: "progress",
  titleKey: "blocks.progress.title",
  descriptionKey: "blocks.progress.description",
  icon: CheckCheckIcon,
  sizes: { w: [3, 4, 6], h: [1] },
  defaultSize: { w: 3, h: 1 },
  Component: ProgressBlock,
};
