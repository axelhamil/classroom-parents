import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { type SchoolClock, schoolClock } from "../../../shared/agenda/school-clock";
import { schoolCalendarRangeFrom } from "../../../shared/agenda/school-clock-context";
import { weekCountsView } from "../../../shared/agenda/views";
import { type ChildDto, childrenQueryOptions } from "../../../shared/api/queries/children";
import type { EventItem } from "../../../shared/api/queries/events";
import { schoolCalendarQueryOptions } from "../../../shared/api/queries/school-calendar";
import { wasReadOnce } from "../../../shared/children/first-sync";
import { useForegroundReturn } from "../../../shared/layout/use-foreground-return";
import { hasAnswered, useAnsweredWithin } from "../../../shared/query/answered-within";
import {
  type AdviceFacts,
  type AdviceSnapshot,
  adviseContext,
  currentHolidayOf,
  type HolidayRange,
} from "../advise-context";
import { emptyBlockIds } from "../block-emptiness";
import { useHomeEvents } from "./use-home-events";
import { useReviewEvents } from "./use-review-events";

const FOREGROUND_RETURN_MS = 60 * 60_000;

const CALENDAR_WAIT_MS = 1_000;

interface AdviceInput {
  events: readonly EventItem[];
  reviewEvents: readonly EventItem[];
  family: readonly ChildDto[];
  clock: SchoolClock;
  holidays: readonly HolidayRange[];
}

interface TakenSnapshot {
  returns: number;
  snapshot: AdviceSnapshot;
}

/**
 * What the advice reads of the family, taken once its sources have answered, failed for good or
 * paused offline, then taken again only when the parent comes back after an hour away: the home
 * never moves under the parent's eyes. Each take reads the instant it happens, not the last minute
 * tick, which a phone freezes in the background. The school calendar may ask a source outside, so
 * it holds the home a second at most, its holidays read as none past that.
 */
export function useAdviceSnapshot(userId: string, clock: SchoolClock): AdviceSnapshot | null {
  const sources = useAdviceSources(userId, clock);
  const returns = useForegroundReturn(FOREGROUND_RETURN_MS);
  const [taken, setTaken] = useState<TakenSnapshot | null>(null);

  if (sources.settled && taken?.returns !== returns)
    setTaken({ returns, snapshot: snapshotOf({ ...sources.input, clock: clockOfNow(clock) }) });

  return taken?.snapshot ?? null;
}

function useAdviceSources(userId: string, clock: SchoolClock) {
  const children = useQuery(childrenQueryOptions);
  const events = useHomeEvents(clock);
  const review = useReviewEvents(null);
  const calendarRange = schoolCalendarRangeFrom(clock.today);
  const calendar = useQuery(schoolCalendarQueryOptions(userId, calendarRange));
  const calendarDone = useAnsweredWithin(calendar, calendarRange.from, CALENDAR_WAIT_MS);

  return {
    settled: calendarDone && [children, events, review.coming, review.backlog].every(hasAnswered),
    input: {
      events: events.data ?? [],
      reviewEvents: review.events,
      family: children.data ?? [],
      clock,
      holidays: calendar.data?.holidays ?? [],
    },
  };
}

function clockOfNow(clock: SchoolClock): SchoolClock {
  return schoolClock(new Date(), clock);
}

function snapshotOf(input: AdviceInput): AdviceSnapshot {
  const holiday = currentHolidayOf(input.clock.today, input.holidays);

  return {
    context: adviseContext(adviceFactsOf(input)),
    emptyBlocks: emptyBlockIds(input),
    holiday: holiday ? { name: holiday.name, endsOn: holiday.endsOn } : null,
  };
}

function adviceFactsOf({ events, family, clock, holidays }: AdviceInput): AdviceFacts {
  const week = weekCountsView(events, clock);

  return {
    now: clock.now,
    timeZone: clock.timeZone,
    childIds: family.map(({ id }) => id),
    deadlinesWithinWeek: week.deadlines,
    assessmentsWithinWeek: week.assessments,
    firstSyncDone: family.some(wasReadOnce),
    holidays,
  };
}
