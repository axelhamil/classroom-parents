import { describe, expect, it } from "bun:test";
import { PARIS_TIME_ZONE } from "@packages/ddd-kit/zoned-time";
import { relativeDeadlineLabel } from "@packages/i18n";
import { alertDeadlineOf } from "../alert-context.query";

const THURSDAY_LATE_UTC = new Date("2026-11-19T23:30:00.000Z");
const FRIDAY_MORNING = { deadlineDate: "2026-11-20", deadlineTime: "08:30:00" };

function labelFor(timeZone: string): string {
  return relativeDeadlineLabel(alertDeadlineOf(FRIDAY_MORNING, THURSDAY_LATE_UTC, timeZone));
}

describe("the day an alert names, read in the parent's zone", () => {
  it("given a Montreal parent at 23:30 UTC on Thursday, then a Friday deadline is tomorrow while a Paris parent already reads today", () => {
    expect(labelFor("America/Montreal")).toBe("demain, 8 h 30");
    expect(labelFor(PARIS_TIME_ZONE)).toBe("aujourd'hui, 8 h 30");
  });

  it("given a zone the server does not know, then the day is read in Paris", () => {
    expect(labelFor("Mars/Olympus_Mons")).toBe("aujourd'hui, 8 h 30");
  });

  it("given any zone, then the deadline keeps the school's wall date and time", () => {
    expect(alertDeadlineOf(FRIDAY_MORNING, THURSDAY_LATE_UTC, "America/Montreal")).toEqual({
      date: "2026-11-20",
      time: "08:30",
      today: "2026-11-19",
    });
  });
});
