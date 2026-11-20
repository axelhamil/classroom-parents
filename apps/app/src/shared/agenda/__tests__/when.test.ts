import { describe, expect, it } from "vitest";
import { schoolClock } from "../school-clock";
import { whenOf } from "../when";

const MONDAY_MORNING = schoolClock(new Date("2026-11-09T09:00:00Z"));

function badgeOf(deadlineDate: string, deadlineTime?: string, clock = MONDAY_MORNING) {
  return whenOf({ deadlineDate, deadlineTime, done: false }, clock, { dated: false }).badge;
}

describe("whenOf", () => {
  it("given a deadline today from the end of the school day, then it is tonight", () => {
    expect(badgeOf("2026-11-09", "18:00")).toEqual({ kind: "tonight", tone: "urgent" });
  });

  it("given a deadline tomorrow before noon, then it is tomorrow morning", () => {
    expect(badgeOf("2026-11-10", "08:30")).toEqual({ kind: "tomorrowMorning", tone: "urgent" });
  });

  it("given a deadline today or tomorrow under its own day heading, then no badge repeats the day", () => {
    expect(badgeOf("2026-11-09", "11:30")).toBeNull();
    expect(badgeOf("2026-11-10", "14:00")).toBeNull();
  });

  it("given a dated line due today or tomorrow, then the urgent word replaces the date", () => {
    const when = whenOf({ deadlineDate: "2026-11-10", done: false }, MONDAY_MORNING, {
      dated: true,
    });

    expect(when).toEqual({ date: null, time: null, badge: { kind: "tomorrow", tone: "urgent" } });
  });

  it("given a deadline today whose time has passed, then no countdown is shown", () => {
    expect(badgeOf("2026-11-09", "08:30")).toBeNull();
    expect(
      badgeOf("2026-11-09", "18:00", schoolClock(new Date("2026-11-09T17:30:00Z"))),
    ).toBeNull();
  });

  it("given a deadline within the coming week, then it counts the days, up to six", () => {
    expect(badgeOf("2026-11-12")).toEqual({ kind: "inDays", days: 3, tone: "soon" });
    expect(badgeOf("2026-11-15")).toEqual({ kind: "inDays", days: 6, tone: "soon" });
    expect(badgeOf("2026-11-16")).toBeNull();
  });
});
