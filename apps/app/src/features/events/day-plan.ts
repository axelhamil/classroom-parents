import { shiftDate } from "@packages/ddd-kit/days";
import type { EventItem } from "../../shared/api/queries/events";
import { hasOpenSteps } from "./checklist-defaults";
import { nextSchoolDay, type SchoolMoment, schoolMoment } from "./week";

export interface DayPlan {
  day: string;
  deadlines: EventItem[];
  toPrepare: EventItem[];
}

const NONE_KEPT: ReadonlySet<string> = new Set();

export function dayPlan(
  events: readonly EventItem[],
  { today, focus }: SchoolMoment,
  childId: string | null,
  kept: ReadonlySet<string> = NONE_KEPT,
): DayPlan {
  const deadlines = events.filter(
    (event) =>
      (childId === null || event.childId === childId) &&
      event.deadlineDate >= today &&
      event.deadlineDate <= focus &&
      (event.deadlineDate === focus || !event.done || kept.has(event.id)),
  );
  const toPrepare = deadlines.filter((event) => !event.done && hasOpenSteps(event));

  return { day: focus, deadlines, toPrepare };
}

export function tomorrowPlan(
  events: readonly EventItem[],
  now: Date,
  childId: string | null,
): DayPlan {
  return dayPlan(events, tonightMoment(now), childId);
}

function tonightMoment(now: Date): SchoolMoment {
  const moment = schoolMoment(now);
  if (moment.focus !== moment.today) return moment;

  return { today: shiftDate(moment.today, 1), focus: nextSchoolDay(moment.today) };
}
