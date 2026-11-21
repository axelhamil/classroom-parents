import { shiftDate, weekdayOf } from "@packages/ddd-kit/days";
import { wallOf } from "../../shared/agenda/school-clock";

export const SCHOOL_AFTERNOON_FROM = "14:00";

export const OFF_DAY_EVENING_FROM = "18:00";

export const CALM_MAX_DEADLINES = 3;

export const BUSY_MIN_DEADLINES = 10;

export const BUSY_MIN_ASSESSMENTS = 2;

export const FEW_CHILDREN_MAX = 3;

export const EVE_DAYS = 2;

const SUNDAY = 0;

const SATURDAY = 6;

export type AdviceMoment = "morning" | "evening" | "week";

export type ChildrenCount = "1" | "2-3" | "4+";

export type DataLoad = "welcome" | "calm" | "normal" | "busy";

export type HolidayPhase = "none" | "during" | "eve";

export interface AdviceContext {
  moment: AdviceMoment;
  children: ChildrenCount;
  childIds: readonly string[];
  data: DataLoad;
  holiday: HolidayPhase;
}

export interface HolidayRange {
  name: string;
  startsOn: string;
  endsOn: string;
}

export interface AdviceHoliday {
  name: string;
  endsOn: string;
}

export interface AdviceSnapshot {
  context: AdviceContext;
  emptyBlocks: ReadonlySet<string>;
  holiday: AdviceHoliday | null;
}

export interface AdviceFacts {
  now: Date;
  timeZone: string;
  childIds: readonly string[];
  deadlinesWithinWeek: number;
  assessmentsWithinWeek: number;
  firstSyncDone: boolean;
  holidays: readonly HolidayRange[];
}

export function adviseContext(facts: AdviceFacts): AdviceContext {
  return {
    moment: momentOf(facts.now, facts.timeZone),
    children: childrenCountOf(facts.childIds.length),
    childIds: facts.childIds,
    data: dataLoadOf(facts),
    holiday: holidayPhaseOf(facts),
  };
}

export function childrenCountOf(count: number): ChildrenCount {
  if (count <= 1) return "1";
  if (count <= FEW_CHILDREN_MAX) return "2-3";

  return "4+";
}

function momentOf(now: Date, timeZone: string): AdviceMoment {
  const { date: today, time } = wallOf(now, timeZone);
  const weekday = weekdayOf(today);

  if (weekday === SATURDAY) return "week";
  if (weekday === SUNDAY) return time >= OFF_DAY_EVENING_FROM ? "evening" : "week";

  return time >= SCHOOL_AFTERNOON_FROM ? "evening" : "morning";
}

function dataLoadOf(facts: AdviceFacts): DataLoad {
  const { childIds, firstSyncDone, deadlinesWithinWeek, assessmentsWithinWeek } = facts;
  const notStarted = childIds.length === 0 || !firstSyncDone;

  if (notStarted && deadlinesWithinWeek === 0) return "welcome";
  if (deadlinesWithinWeek >= BUSY_MIN_DEADLINES || assessmentsWithinWeek >= BUSY_MIN_ASSESSMENTS)
    return "busy";
  if (deadlinesWithinWeek <= CALM_MAX_DEADLINES && assessmentsWithinWeek === 0) return "calm";

  return "normal";
}

export function currentHolidayOf(
  today: string,
  holidays: readonly HolidayRange[],
): HolidayRange | undefined {
  return holidays.find(({ startsOn, endsOn }) => startsOn <= today && today <= endsOn);
}

function holidayPhaseOf({ now, timeZone, holidays }: AdviceFacts): HolidayPhase {
  const { date: today, time } = wallOf(now, timeZone);
  const current = currentHolidayOf(today, holidays);
  if (!current) return "none";

  const eveDay = today >= shiftDate(current.endsOn, 1 - EVE_DAYS);

  return eveDay && time >= OFF_DAY_EVENING_FROM ? "eve" : "during";
}
