import {
  Briefing,
  BriefingGroup,
  BriefingGroupHeader,
  BriefingGroups,
  BriefingGroupTitle,
  BriefingItem,
  BriefingList,
  BriefingStat,
  BriefingSummary,
  BriefingTitle,
} from "@packages/ui/components/ui/briefing";
import { CelebrationStamp } from "@packages/ui/components/ui/celebration-stamp";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { Progress, ProgressLegend, ProgressRow } from "@packages/ui/components/ui/progress";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { CheckCheckIcon } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import type { EventItem } from "../../../shared/api/queries/events";
import { childAvatarSrc } from "../../../shared/children/child-avatar-src";
import { isFirstSyncRunning } from "../../../shared/events/event-board";
import { EventCard } from "../../../shared/events/event-card";
import { childHue, childLabelOf } from "../../../shared/format/child-hue";
import { dayLabel, inSentence } from "../../../shared/format/deadline-label";
import { QueryState } from "../../../shared/query/query-state";
import { calendarEventsQueryOptions, nextEventQueryOptions } from "../api/events.queries";
import { dayPlan } from "../day-plan";
import { type SchoolMoment, schoolMoment, weekAhead } from "../week";
import { ShowMoreButton, useShowMore } from "./blocks/show-more";
import { CalendarEventRow } from "./calendar/calendar-event-row";
import { EventSteps } from "./prepare-checklist";

export interface NextSchoolBriefingProps {
  family: readonly ChildDto[];
  childId: string | null;
  now: Date;
  rows: number;
}

export function NextSchoolBriefing({ family, childId, now, rows }: NextSchoolBriefingProps) {
  const { t } = useTranslation("events");
  const titleId = useId();
  const moment = schoolMoment(now);
  const day = inSentence(dayLabel(moment.focus, now));
  const query = useQuery(calendarEventsQueryOptions(weekAhead(moment.today)));
  const watched = childId ? family.filter((child) => child.id === childId) : family;

  return (
    <Briefing aria-labelledby={titleId} data-jump={moment.focus} tabIndex={-1} className="flex-1">
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
            rows={rows}
            moment={moment}
            day={day}
          />
        )}
      </QueryState>
    </Briefing>
  );
}

interface DayStatProps {
  events: readonly EventItem[];
  day: string;
}

function DayStat({ events, day }: DayStatProps) {
  const { t } = useTranslation("events");
  const assessments = events.filter((event) => event.category === "assessment").length;

  return (
    <BriefingStat>
      {assessments > 0
        ? t("briefing.dayWithAssessments", {
            count: events.length,
            day,
            assessments: t("briefing.assessments", { count: assessments }),
          })
        : t("briefing.day", { count: events.length, day })}
    </BriefingStat>
  );
}

interface DayProgressProps {
  done: number;
  total: number;
  allSet: boolean;
}

function DayProgress({ done, total, allSet }: DayProgressProps) {
  const { t } = useTranslation("events");
  const legendId = useId();
  const legend = t("briefing.legend", { count: done, total });

  return (
    <ProgressRow>
      <Progress
        value={done}
        max={total}
        tone={allSet ? "success" : "ink"}
        aria-label={t("briefing.progress", { count: done, total })}
        aria-describedby={legendId}
        getValueLabel={() => legend}
      />
      <ProgressLegend id={legendId}>{legend}</ProgressLegend>
    </ProgressRow>
  );
}

interface BriefingBodyProps {
  events: readonly EventItem[];
  family: readonly ChildDto[];
  childId: string | null;
  now: Date;
  rows: number;
  moment: SchoolMoment;
  day: string;
}

function BriefingBody({
  events: loaded,
  family,
  childId,
  now,
  rows,
  moment,
  day,
}: BriefingBodyProps) {
  const { t } = useTranslation("events");
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set());
  const events = dayPlan(loaded, moment, childId, shown).deadlines;
  const unseen = events.filter((event) => !shown.has(event.id));
  if (unseen.length > 0) setShown(new Set([...shown, ...unseen.map((event) => event.id)]));
  const open = events.filter((event) => !event.done).length;
  const allSet = events.length > 0 && open === 0;

  if (events.length === 0)
    return isFirstSyncRunning(family) ? (
      <BriefingSummary>{t("empty.syncing.title")}</BriefingSummary>
    ) : (
      <NothingDue family={family} childId={childId} after={moment.focus} day={day} />
    );

  return (
    <>
      <DayStat events={events} day={day} />
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
      <DayProgress done={events.length - open} total={events.length} allSet={allSet} />
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
              rows={rows}
              moment={moment}
            />
          );
        })}
      </BriefingGroups>
    </>
  );
}

interface ChildBriefingProps {
  child: ChildDto;
  events: readonly EventItem[];
  family: readonly ChildDto[];
  now: Date;
  rows: number;
  moment: SchoolMoment;
}

function ChildBriefing({ child, events, family, now, rows, moment }: ChildBriefingProps) {
  const titleId = useId();
  const listId = useId();
  const { shown, more } = useShowMore(events, rows);

  return (
    <BriefingGroup aria-labelledby={titleId}>
      <BriefingGroupHeader>
        <ChildAvatar
          name={child.label}
          tone={childHue(family, child.id)}
          src={childAvatarSrc(child)}
          size="sm"
        />
        <BriefingGroupTitle id={titleId}>{child.label}</BriefingGroupTitle>
      </BriefingGroupHeader>
      <BriefingList id={listId}>
        {shown.map((event) => (
          <BriefingItem key={event.id}>
            <CalendarEventRow
              event={event}
              family={family}
              now={now}
              today={moment.today}
              dated={event.deadlineDate !== moment.focus}
              withChild={false}
            >
              {!event.done && <EventSteps event={event} />}
            </CalendarEventRow>
          </BriefingItem>
        ))}
      </BriefingList>
      <ShowMoreButton more={more} controls={listId} />
    </BriefingGroup>
  );
}

interface NothingDueProps {
  family: readonly ChildDto[];
  childId: string | null;
  after: string;
  day: string;
}

function NothingDue({ family, childId, after, day }: NothingDueProps) {
  const { t } = useTranslation("events");
  const nextId = useId();
  const next = useQuery(nextEventQueryOptions(childId)).data;
  const upcoming = next && next.deadlineDate > after ? next : null;

  return (
    <>
      <BriefingSummary>{t("briefing.empty", { day })}</BriefingSummary>
      {upcoming && (
        <BriefingGroup aria-labelledby={nextId}>
          <BriefingGroupTitle id={nextId}>{t("briefing.next")}</BriefingGroupTitle>
          <EventCard
            event={upcoming}
            childLabel={family.length > 1 ? childLabelOf(family, upcoming.childId) : ""}
            hue={childHue(family, upcoming.childId)}
          />
        </BriefingGroup>
      )}
    </>
  );
}
