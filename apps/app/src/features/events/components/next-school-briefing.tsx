import {
  Briefing,
  BriefingGroup,
  BriefingGroupHeader,
  BriefingGroups,
  BriefingGroupTitle,
  BriefingItem,
  BriefingList,
  BriefingSummary,
  BriefingTitle,
} from "@packages/ui/components/ui/briefing";
import { CelebrationStamp } from "@packages/ui/components/ui/celebration-stamp";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { Progress } from "@packages/ui/components/ui/progress";
import { ScrollRegion } from "@packages/ui/components/ui/scroll-region";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { CheckCheckIcon } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import type { EventItem } from "../../../shared/api/queries/events";
import { isFirstSyncRunning } from "../../../shared/events/event-board";
import { childHue } from "../../../shared/format/child-hue";
import { dayLabel, inSentence } from "../../../shared/format/deadline-label";
import { QueryState } from "../../../shared/query/query-state";
import { calendarEventsQueryOptions, nextEventQueryOptions } from "../api/events.queries";
import { useChecklist } from "../hooks/use-checklist";
import { type SchoolMoment, schoolMoment, weekAhead } from "../week";
import { CalendarEventRow } from "./calendar/calendar-event-row";
import { ChecklistRows } from "./prepare-checklist";

export interface NextSchoolBriefingProps {
  family: readonly ChildDto[];
  childId: string | null;
  now: Date;
}

export function NextSchoolBriefing({ family, childId, now }: NextSchoolBriefingProps) {
  const { t } = useTranslation("events");
  const titleId = useId();
  const moment = schoolMoment(now);
  const day = inSentence(dayLabel(moment.focus, now));
  const query = useQuery(calendarEventsQueryOptions(weekAhead(moment.today)));
  const watched = childId ? family.filter((child) => child.id === childId) : family;

  return (
    <Briefing
      aria-labelledby={titleId}
      data-jump={moment.focus}
      tabIndex={-1}
      className="max-h-briefing-phone md:sticky md:top-briefing-top md:max-h-briefing-panel-height"
    >
      <BriefingTitle id={titleId}>{t("briefing.title", { day })}</BriefingTitle>
      <QueryState
        query={query}
        skeleton={
          <SkeletonGroup label={t("briefing.loading")} className="gap-3">
            <Skeleton shape="line" className="w-48" />
            <Skeleton className="h-16 w-full" />
          </SkeletonGroup>
        }
      >
        {(events) => (
          <BriefingBody
            key={moment.focus}
            events={events}
            family={watched}
            childId={childId}
            now={now}
            moment={moment}
            day={day}
          />
        )}
      </QueryState>
    </Briefing>
  );
}

function dueBy(
  events: readonly EventItem[],
  { today, focus }: SchoolMoment,
  childId: string | null,
  shown: ReadonlySet<string>,
): EventItem[] {
  return events.filter(
    (event) =>
      (childId === null || event.childId === childId) &&
      event.deadlineDate >= today &&
      event.deadlineDate <= focus &&
      (event.deadlineDate === focus || !event.done || shown.has(event.id)),
  );
}

interface BriefingBodyProps {
  events: readonly EventItem[];
  family: readonly ChildDto[];
  childId: string | null;
  now: Date;
  moment: SchoolMoment;
  day: string;
}

function BriefingBody({ events: loaded, family, childId, now, moment, day }: BriefingBodyProps) {
  const { t } = useTranslation("events");
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set());
  const events = dueBy(loaded, moment, childId, shown);
  const unseen = events.filter((event) => !shown.has(event.id));
  if (unseen.length > 0) setShown(new Set([...shown, ...unseen.map((event) => event.id)]));
  const open = events.filter((event) => !event.done).length;
  const allSet = events.length > 0 && open === 0;

  if (events.length === 0)
    return isFirstSyncRunning(family) ? (
      <BriefingSummary>{t("empty.syncing.title")}</BriefingSummary>
    ) : (
      <NothingDue childId={childId} now={now} after={moment.focus} day={day} />
    );

  return (
    <>
      {allSet ? (
        <BriefingSummary tone="ready">
          <CelebrationStamp>
            <CheckCheckIcon />
          </CelebrationStamp>
          {t("briefing.allSet", { day })}
        </BriefingSummary>
      ) : (
        <BriefingSummary>{t("briefing.open", { count: open })}</BriefingSummary>
      )}
      <Progress
        value={events.length - open}
        max={events.length}
        tone={allSet ? "success" : "primary"}
        aria-label={t("briefing.progress", { count: events.length - open, total: events.length })}
      />
      <ScrollRegion variant="panel" label={t("briefing.scroll", { day })}>
        <BriefingGroups>
          {family.map((child) => {
            const due = events.filter((event) => event.childId === child.id);
            if (due.length === 0) return null;

            return (
              <ChildBriefing
                key={child.id}
                child={child}
                events={due}
                family={family}
                now={now}
                moment={moment}
              />
            );
          })}
        </BriefingGroups>
      </ScrollRegion>
    </>
  );
}

interface ChildBriefingProps {
  child: ChildDto;
  events: readonly EventItem[];
  family: readonly ChildDto[];
  now: Date;
  moment: SchoolMoment;
}

function ChildBriefing({ child, events, family, now, moment }: ChildBriefingProps) {
  const titleId = useId();

  return (
    <BriefingGroup aria-labelledby={titleId}>
      <BriefingGroupHeader>
        <ChildAvatar
          name={child.label}
          tone={childHue(family, child.id)}
          src={child.avatarUrl}
          size="sm"
        />
        <BriefingGroupTitle id={titleId}>{child.label}</BriefingGroupTitle>
      </BriefingGroupHeader>
      <BriefingList>
        {events.map((event) => (
          <BriefingItem key={event.id}>
            <CalendarEventRow
              event={event}
              family={family}
              now={now}
              today={moment.today}
              dated={event.deadlineDate !== moment.focus}
              withChild={false}
            />
            {!event.done && <EventPreparation event={event} />}
          </BriefingItem>
        ))}
      </BriefingList>
    </BriefingGroup>
  );
}

interface EventPreparationProps {
  event: EventItem;
}

function EventPreparation({ event }: EventPreparationProps) {
  const checklist = useChecklist(event);
  if (checklist.items.length === 0) return null;

  return <ChecklistRows checklist={checklist} />;
}

interface NothingDueProps {
  childId: string | null;
  now: Date;
  after: string;
  day: string;
}

function NothingDue({ childId, now, after, day }: NothingDueProps) {
  const { t } = useTranslation("events");
  const next = useQuery(nextEventQueryOptions(childId)).data;

  return (
    <BriefingSummary>
      {next && next.deadlineDate > after
        ? t("briefing.emptyThenNext", {
            day,
            title: next.title,
            next: inSentence(dayLabel(next.deadlineDate, now)),
          })
        : t("briefing.empty", { day })}
    </BriefingSummary>
  );
}
