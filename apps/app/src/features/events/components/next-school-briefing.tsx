import { relativeDayLabel } from "@packages/i18n";
import {
  BriefingGroup,
  BriefingGroupHeader,
  BriefingGroups,
  BriefingGroupTitle,
  BriefingItem,
  BriefingList,
  BriefingStat,
  BriefingSummary,
} from "@packages/ui/components/ui/briefing";
import { CelebrationStamp } from "@packages/ui/components/ui/celebration-stamp";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import {
  AllDoneIcon,
  NothingDueIcon,
  SyncingIcon,
  TodayIcon,
} from "@packages/ui/components/ui/icons";
import { Progress, ProgressLegend, ProgressRow } from "@packages/ui/components/ui/progress";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { isOpen } from "../../../shared/agenda/deadline-facts";
import type { SchoolClock } from "../../../shared/agenda/school-clock";
import { dayPlanView, nextAfterFocus } from "../../../shared/agenda/views";
import type { ChildDto } from "../../../shared/api/queries/children";
import type { EventItem } from "../../../shared/api/queries/events";
import { childAvatarSrc } from "../../../shared/children/child-avatar-src";
import { isFirstSyncRunning } from "../../../shared/events/event-board";
import { childHue } from "../../../shared/format/child-hue";
import { inSentence } from "../../../shared/format/deadline-label";
import { QueryState } from "../../../shared/query/query-state";
import { nextEventQueryOptions } from "../api/events.queries";
import { useHomeEvents } from "../hooks/use-home-events";
import { BlockEmpty, NextDeadlineLink } from "./blocks/block-empty";
import { BlockPanel } from "./blocks/block-panel";
import { CalendarEventRow } from "./calendar/calendar-event-row";
import { EventSteps } from "./prepare-checklist";

export interface NextSchoolBriefingProps {
  family: readonly ChildDto[];
  childId: string | null;
  clock: SchoolClock;
}

export function NextSchoolBriefing({ family, childId, clock }: NextSchoolBriefingProps) {
  const { t } = useTranslation("events");
  const day = inSentence(relativeDayLabel(clock.focus, clock.today));
  const query = useHomeEvents(clock);
  const watched = childId ? family.filter((child) => child.id === childId) : family;

  return (
    <BlockPanel title={t("briefing.title", { day })} icon={TodayIcon} jump={clock.focus}>
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
            day={day}
          />
        )}
      </QueryState>
    </BlockPanel>
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
  day: string;
}

function BriefingBody({ events: loaded, family, childId, clock, day }: BriefingBodyProps) {
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
  const groups = <DayGroups events={listed} family={family} clock={clock} />;

  if (events.length === 0 && isFirstSyncRunning(family))
    return (
      <BlockEmpty
        icon={SyncingIcon}
        title={t("empty.syncing.title")}
        hint={t("empty.syncing.description")}
      />
    );

  if (listed.length === 0)
    return <NothingDue events={loaded} childId={childId} clock={clock} day={day} />;

  if (events.length === 0)
    return (
      <>
        <BriefingSummary>{t("briefing.empty", { day })}</BriefingSummary>
        <BriefingSummary>{t("briefing.leftToday", { count: leftToday })}</BriefingSummary>
        {groups}
      </>
    );

  return (
    <>
      <DayStat events={events} day={day} />
      {allSet ? (
        <BriefingSummary tone="ready">
          <CelebrationStamp>
            <AllDoneIcon />
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
  clock: SchoolClock;
}

function DayGroups({ events, family, clock }: DayGroupsProps) {
  return (
    <BriefingGroups>
      {family.map((child) => {
        const due = events.filter((event) => event.childId === child.id);
        if (due.length === 0) return null;

        return (
          <ChildBriefing key={child.id} child={child} events={due} family={family} clock={clock} />
        );
      })}
    </BriefingGroups>
  );
}

interface ChildBriefingProps {
  child: ChildDto;
  events: readonly EventItem[];
  family: readonly ChildDto[];
  clock: SchoolClock;
}

function ChildBriefing({ child, events, family, clock }: ChildBriefingProps) {
  const titleId = useId();

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
      <BriefingList>
        {events.map((event) => (
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
    </BriefingGroup>
  );
}

interface NothingDueProps {
  events: readonly EventItem[];
  childId: string | null;
  clock: SchoolClock;
  day: string;
}

function NothingDue({ events, childId, clock, day }: NothingDueProps) {
  const { t } = useTranslation(["events", "home"]);
  const loadedNext = nextAfterFocus(events, clock, childId);
  const serverNext = useQuery(nextEventQueryOptions(childId)).data;
  const later = serverNext && serverNext.deadlineDate > clock.focus ? serverNext : null;
  const upcoming = loadedNext ?? later;

  return (
    <BlockEmpty
      icon={NothingDueIcon}
      title={t("briefing.empty", { day })}
      hint={
        upcoming ? (
          <NextDeadlineLink
            event={upcoming}
            today={clock.today}
            sentence={(fields) => t("blocks.next", { ...fields, ns: "home" })}
          />
        ) : (
          t("briefing.emptyHint")
        )
      }
    />
  );
}
