import { Item, ItemContent, ItemDescription, ItemTitle } from "@packages/ui/components/ui/item";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheckIcon } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { EventItem } from "../../../../shared/api/queries/events";
import { EventLink } from "../../../../shared/events/event-link";
import { childLabelOf } from "../../../../shared/format/child-hue";
import { capitalize, daysUntil } from "../../../../shared/format/deadline-label";
import { schoolToday } from "../../../../shared/format/school-today";
import { calendarEventsQueryOptions } from "../../api/events.queries";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { EventSteps } from "../prepare-checklist";
import { BlockPanel } from "./block-panel";
import { forChild } from "./event-rows";
import { ShowMoreButton, useShowMore } from "./show-more";
import { upcomingWindow } from "./upcoming-events";

function useDaysLeft(now: Date): (event: EventItem) => string {
  const { t } = useTranslation("home");

  return (event) => {
    const days = daysUntil(event.deadlineDate, now);
    if (days === 0) return t("blocks.assessments.today");
    if (days === 1) return t("blocks.assessments.tomorrow");

    return t("blocks.assessments.inDays", { count: days });
  };
}

function AssessmentsBlock({ family, childId, now, title, rows }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const listId = useId();
  const daysLeft = useDaysLeft(now);
  const query = useQuery(calendarEventsQueryOptions(upcomingWindow(schoolToday(now))));
  const due = forChild(query.data ?? [], childId).filter(
    (event) => !event.done && event.category === "assessment",
  );
  const { shown, more } = useShowMore(due, rows);

  const whenFor = (event: EventItem) =>
    family.length > 1
      ? t("blocks.assessments.due", {
          child: childLabelOf(family, event.childId),
          when: daysLeft(event),
        })
      : capitalize(daysLeft(event));

  return (
    <BlockPanel
      title={title}
      icon={ClipboardCheckIcon}
      note={query.isSuccess && due.length === 0 && t("blocks.assessments.empty")}
    >
      {due.length > 0 && (
        <>
          <ul id={listId} className="flex flex-col gap-2">
            {shown.map((event) => (
              <Item key={event.id} asChild variant="outline" size="sm">
                <li>
                  <ItemContent>
                    <ItemTitle>
                      <EventLink eventId={event.id}>{event.title}</EventLink>
                    </ItemTitle>
                    <ItemDescription>{whenFor(event)}</ItemDescription>
                    <EventSteps event={event} />
                  </ItemContent>
                </li>
              </Item>
            ))}
          </ul>
          <ShowMoreButton more={more} controls={listId} />
        </>
      )}
    </BlockPanel>
  );
}

export const assessmentsBlock: HomeBlockDefinition = {
  id: "assessments",
  titleKey: "blocks.assessments.title",
  descriptionKey: "blocks.assessments.description",
  icon: ClipboardCheckIcon,
  sizes: { w: [3, 4, 6, 8], h: [1, 2, 3] },
  defaultSize: { w: 4, h: 1 },
  Component: AssessmentsBlock,
};
