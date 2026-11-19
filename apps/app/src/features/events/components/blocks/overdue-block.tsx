import { useQuery } from "@tanstack/react-query";
import { ClockAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { schoolToday } from "../../../../shared/format/school-today";
import { calendarEventsQueryOptions } from "../../api/events.queries";
import { isOverdue, overdueWindow } from "../../calendar";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { BlockPanel } from "./block-panel";
import { EventRows, forChild } from "./event-rows";

function OverdueBlock({ family, childId, now, title, rows }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const { t: tEvents } = useTranslation("events");
  const today = schoolToday(now);
  const query = useQuery(calendarEventsQueryOptions(overdueWindow(today)));
  const late = forChild(query.data ?? [], childId)
    .filter((event) => isOverdue(event, today))
    .sort((left, right) => right.deadlineDate.localeCompare(left.deadlineDate));

  return (
    <BlockPanel
      title={title}
      label={late.length > 0 ? tEvents("calendar.overdueCount", { count: late.length }) : undefined}
      count={late.length}
      icon={ClockAlertIcon}
      note={query.isSuccess && late.length === 0 && t("blocks.overdue.empty")}
    >
      {late.length > 0 && (
        <EventRows events={late} family={family} now={now} today={today} rows={rows} />
      )}
    </BlockPanel>
  );
}

export const overdueBlock: HomeBlockDefinition = {
  id: "overdue",
  titleKey: "blocks.overdue.title",
  descriptionKey: "blocks.overdue.description",
  icon: ClockAlertIcon,
  sizes: { w: [3, 4, 6, 8], h: [1, 2, 3] },
  defaultSize: { w: 4, h: 1 },
  Component: OverdueBlock,
};
