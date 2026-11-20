import { daysFrom, shiftDate } from "@packages/ddd-kit/days";
import { PARIS_TIME_ZONE, zonedWallTimeToUtcShifted } from "@packages/ddd-kit/zoned-time";
import { EVENT_CATEGORIES } from "@packages/events/agenda-contract";
import fc from "fast-check";
import type { EventItem } from "../../api/queries/events";
import { CHECKLIST_DEFAULTS } from "../checklist-template";
import { type SchoolClock, schoolClock } from "../school-clock";

const FIRST_DAY = "2026-08-24";
const DAYS_COVERED = 330;

const CHILDREN = ["child-a", "child-b", "child-c"] as const;

/** Toussaint and Noël 2026 for zone C, and the bank holidays they hold. */
const ZONE_C_CLOSED_DAYS: ReadonlySet<string> = new Set([
  ...daysFrom("2026-10-17", 16),
  ...daysFrom("2026-12-19", 16),
  "2026-11-11",
  "2027-05-13",
]);

/** The minutes a school day turns on, on both sides, and midnight. */
const EDGE_TIMES = ["23:59", "00:01", "15:59", "16:00", "16:01", "17:59", "18:01", "12:00"];

/** Friday evenings, a Saturday, holiday eves and both daylight saving changes. */
const EDGE_DAYS = [
  "2026-10-16",
  "2026-10-17",
  "2026-10-24",
  "2026-10-25",
  "2026-11-10",
  "2026-12-18",
  "2027-03-27",
  "2027-03-28",
];

const wallDate = fc.oneof(
  fc.integer({ min: 0, max: DAYS_COVERED }).map((offset) => shiftDate(FIRST_DAY, offset)),
  fc.constantFrom(...EDGE_DAYS),
);

const minute = fc.integer({ min: 0, max: 23 * 60 + 59 }).map((total) => {
  const hours = String(Math.floor(total / 60)).padStart(2, "0");

  return `${hours}:${String(total % 60).padStart(2, "0")}`;
});

const wallTime = fc.oneof(minute, fc.constantFrom(...EDGE_TIMES));

function instantOf(date: string, time: string): Date {
  const shifted = zonedWallTimeToUtcShifted(date, time, PARIS_TIME_ZONE);
  if (shifted.isFailure) throw new Error(`no instant for ${date} ${time}`);

  return shifted.getValue().at;
}

export const clockArb: fc.Arbitrary<SchoolClock> = fc
  .record({ date: wallDate, time: wallTime, holidays: fc.boolean() })
  .map(({ date, time, holidays }) =>
    schoolClock(instantOf(date, time), {
      timeZone: PARIS_TIME_ZONE,
      closedDays: holidays ? ZONE_C_CLOSED_DAYS : new Set(),
    }),
  );

export const familyArb = fc.constantFrom([CHILDREN[0]], [...CHILDREN]);

let sequence = 0;

function eventArb(today: string, family: readonly string[]): fc.Arbitrary<EventItem> {
  return fc
    .record({
      offset: fc.integer({ min: -20, max: 20 }),
      time: fc.option(fc.constantFrom("08:00", "11:59", "12:00", "16:00", "18:00", "23:59"), {
        nil: undefined,
      }),
      childId: fc.constantFrom(...family),
      category: fc.constantFrom(...EVENT_CATEGORIES),
      done: fc.boolean(),
      review: fc.boolean(),
      ticked: fc.boolean(),
    })
    .map(({ offset, time, childId, category, done, review, ticked }) => {
      sequence += 1;
      const deadlineDate = shiftDate(today, offset);

      return {
        id: `event-${sequence}`,
        childId,
        course: null,
        title: `Échéance ${sequence}`,
        description: "",
        category,
        deadlineDate,
        deadlineTime: time,
        deadlineAt: `${deadlineDate}T${time ?? "23:59"}:00.000Z`,
        status: review ? "needs_review" : "confirmed",
        reviewReasons: [],
        source: "announcement",
        done,
        receivedAt: "2026-08-20T08:00:00.000Z",
        edited: false,
        editedFields: [],
        checklist: {
          done: ticked ? [...CHECKLIST_DEFAULTS[category]] : [],
          removed: [],
          extra: [],
        },
      } satisfies EventItem;
    });
}

/** A clock, a family of one or three children and up to 30 deadlines around its today. */
export const agendaArb = fc
  .record({ clock: clockArb, family: familyArb })
  .chain(({ clock, family }) =>
    fc.record({
      clock: fc.constant(clock),
      family: fc.constant(family),
      events: fc.array(eventArb(clock.today, family), { maxLength: 30 }),
      childId: fc.constantFrom(null, ...family),
    }),
  );
