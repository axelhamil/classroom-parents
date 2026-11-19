import { useQuery } from "@tanstack/react-query";
import { BackpackIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EventItem } from "../../../../shared/api/queries/events";
import type { EventCategory } from "../../../../shared/events/event-labels";
import { dayLabel, inSentence } from "../../../../shared/format/deadline-label";
import { schoolToday } from "../../../../shared/format/school-today";
import { calendarEventsQueryOptions } from "../../api/events.queries";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { nextSchoolDay, weekAhead } from "../../week";
import { EventSteps } from "../prepare-checklist";
import { BlockPanel } from "./block-panel";
import { EventRows, forChild } from "./event-rows";

const TO_PACK: readonly EventCategory[] = ["swimming", "school_trip", "document_due"];

function toPrepare(event: EventItem, day: string): boolean {
  if (event.done || event.deadlineDate !== day) return false;

  return TO_PACK.includes(event.category) || event.checklist.extra.length > 0;
}

function TonightBlock({ family, childId, now, title, rows }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const today = schoolToday(now);
  const tomorrow = nextSchoolDay(today);
  const day = inSentence(dayLabel(tomorrow, now));
  const query = useQuery(calendarEventsQueryOptions(weekAhead(today)));
  const due = forChild(query.data ?? [], childId).filter((event) => toPrepare(event, tomorrow));

  return (
    <BlockPanel
      title={title}
      icon={BackpackIcon}
      note={
        query.isSuccess &&
        (due.length === 0 ? t("blocks.tonight.empty", { day }) : t("blocks.tonight.day", { day }))
      }
    >
      {due.length > 0 && (
        <EventRows
          events={due}
          family={family}
          now={now}
          today={today}
          rows={rows}
          steps={(event) => <EventSteps event={event} />}
        />
      )}
    </BlockPanel>
  );
}

export const tonightBlock: HomeBlockDefinition = {
  id: "tonight",
  titleKey: "blocks.tonight.title",
  descriptionKey: "blocks.tonight.description",
  icon: BackpackIcon,
  sizes: { w: [3, 4, 6, 8], h: [1, 2, 3] },
  defaultSize: { w: 4, h: 1 },
  Component: TonightBlock,
};
