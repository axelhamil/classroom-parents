import { relativeDayLabel } from "@packages/i18n";
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
import { isOpen } from "../../../shared/agenda/deadline-facts";
import type { SchoolClock } from "../../../shared/agenda/school-clock";
import { dayPlanView, nextAfterFocus } from "../../../shared/agenda/views";
import type { ChildDto } from "../../../shared/api/queries/children";
import type { EventItem } from "../../../shared/api/queries/events";
import { childAvatarSrc } from "../../../shared/children/child-avatar-src";
import { isFirstSyncRunning } from "../../../shared/events/event-board";
import { EventCard } from "../../../shared/events/event-card";
import { childHue, childLabelOf } from "../../../shared/format/child-hue";
import { inSentence } from "../../../shared/format/deadline-label";
import { QueryState } from "../../../shared/query/query-state";
import { nextEventQueryOptions } from "../api/events.queries";
import { useHomeEvents } from "../hooks/use-home-events";
import { ShowMoreButton, useShowMore } from "./blocks/show-more";
import { CalendarEventRow } from "./calendar/calendar-event-row";
import { EventSteps } from "./prepare-checklist";

export interface NextSchoolBriefingProps {
  family: readonly ChildDto[];
  childId: string | null;
  clock: SchoolClock;
  rows: number;
}

export function NextSchoolBriefing({ family, childId, clock, rows }: NextSchoolBriefingProps) {
  const { t } = useTranslation("events");
  const titleId = useId();
  const day = inSentence(relativeDayLabel(clock.focus, clock.today));
  const query = useHomeEvents(clock);
  const watched = childId ? family.filter((child) => child.id === childId) : family;

  return (
    <Briefing aria-labelledby={titleId} data-jump={clock.focus} tabIndex={-1} className="flex-1">
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
            key={clock.focus}
            events={events}
            family={watched}
            childId={childId}
            clock={clock}
            rows={rows}
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
  clock: SchoolClock;
  rows: number;
  day: string;
}

function BriefingBody({ events: loaded, family, childId, clock, rows, day }: BriefingBodyProps) {
  const { t } = useTranslation("events");
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set());
  const plan = dayPlanView(loaded, clock, { childId, kept: shown });
  const listed = [...plan.leftToday, ...plan.deadlines];
  const unseen = listed.filter((event) => !shown.has(event.id));
  if (unseen.length > 0) setShown(new Set([...shown, ...unseen.map((event) => event.id)]));
  const events = plan.deadlines;
  const open = plan.open.length;
  const allSet = events.length > 0 && open === 0;
  const leftToday = plan.leftToday.filter(isOpen).length;
  const groups = <DayGroups events={listed} family={family} rows={rows} clock={clock} />;

  if (events.length === 0)
    return isFirstSyncRunning(family) ? (
      <BriefingSummary>{t("empty.syncing.title")}</BriefingSummary>
    ) : (
      <>
        <NothingDue events={loaded} family={family} childId={childId} clock={clock} day={day} />
        {leftToday > 0 && (
          <BriefingSummary>{t("briefing.leftToday", { count: leftToday })}</BriefingSummary>
        )}
        {listed.length > 0 && groups}
      </>
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
      {leftToday > 0 && (
        <BriefingSummary>{t("briefing.leftToday", { count: leftToday })}</BriefingSummary>
      )}
      {groups}
    </>
  );
}

interface DayGroupsProps {
  events: readonly EventItem[];
  family: readonly ChildDto[];
  rows: number;
  clock: SchoolClock;
}

function DayGroups({ events, family, rows, clock }: DayGroupsProps) {
  return (
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
            rows={rows}
            clock={clock}
          />
        );
      })}
    </BriefingGroups>
  );
}

interface ChildBriefingProps {
  child: ChildDto;
  events: readonly EventItem[];
  family: readonly ChildDto[];
  rows: number;
  clock: SchoolClock;
}

function ChildBriefing({ child, events, family, rows, clock }: ChildBriefingProps) {
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
              dated={event.deadlineDate !== clock.focus}
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
  events: readonly EventItem[];
  family: readonly ChildDto[];
  childId: string | null;
  clock: SchoolClock;
  day: string;
}

function NothingDue({ events, family, childId, clock, day }: NothingDueProps) {
  const { t } = useTranslation("events");
  const nextId = useId();
  const loadedNext = nextAfterFocus(events, clock, childId);
  const serverNext = useQuery(nextEventQueryOptions(childId)).data;
  const later = serverNext && serverNext.deadlineDate > clock.focus ? serverNext : null;
  const upcoming = loadedNext ?? later;

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
