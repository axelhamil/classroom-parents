import { describe, expect, it } from "vitest";
import { daysFrom, isWeekday, mondayOf, weekdayOf } from "../primitives/days";

describe("days", () => {
  it("reads the weekday of a date, Sunday being 0", () => {
    expect(["2026-11-15", "2026-11-16", "2026-11-21"].map(weekdayOf)).toEqual([0, 1, 6]);
  });

  it("finds the Monday of a date's week, a Sunday closing the week before", () => {
    expect(["2026-11-16", "2026-11-19", "2026-11-22", "2027-01-01"].map(mondayOf)).toEqual([
      "2026-11-16",
      "2026-11-16",
      "2026-11-16",
      "2026-12-28",
    ]);
  });

  it("counts Monday to Friday as weekdays", () => {
    expect(daysFrom("2026-11-15", 7).map(isWeekday)).toEqual([
      false,
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it("lists consecutive dates across a month end", () => {
    expect(daysFrom("2026-11-29", 3)).toEqual(["2026-11-29", "2026-11-30", "2026-12-01"]);
  });
});
