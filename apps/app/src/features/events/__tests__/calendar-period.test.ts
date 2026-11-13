import { describe, expect, it } from "vitest";
import { calendarPeriod, isCrunchDay, isOverdue, shiftAnchor } from "../calendar";

describe("calendarPeriod", () => {
  it("Semaine covers the seven days that start on the anchor day", () => {
    const period = calendarPeriod("week", "2026-11-13");

    expect([period.from, period.to]).toEqual(["2026-11-13", "2026-11-19"]);
    expect(period.days).toHaveLength(7);
  });

  it("Mois covers the six weeks its grid draws, under the 62 day range cap", () => {
    const period = calendarPeriod("month", "2026-11-12");

    expect([period.from, period.to]).toEqual(["2026-10-26", "2026-12-06"]);
    expect(period.days).toHaveLength(42);
  });
});

describe("shiftAnchor", () => {
  it("moves by the length of the visible period", () => {
    expect(shiftAnchor("week", "2026-11-12", 1)).toBe("2026-11-19");
    expect(shiftAnchor("week", "2026-11-12", -1)).toBe("2026-11-05");
    expect(shiftAnchor("month", "2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftAnchor("month", "2026-01-15", -1)).toBe("2025-12-01");
  });
});

describe("crunch and overdue", () => {
  const open = { done: false, deadlineDate: "2026-11-13" };

  it("a day is a crunch from three open deadlines, done ones do not count", () => {
    expect(isCrunchDay("2026-11-13", [open, open], "2026-11-12")).toBe(false);
    expect(isCrunchDay("2026-11-13", [open, open, { ...open, done: true }], "2026-11-12")).toBe(
      false,
    );
    expect(isCrunchDay("2026-11-13", [open, open, open], "2026-11-12")).toBe(true);
  });

  it("only today and the days ahead warn, a past day is no longer a crunch", () => {
    expect(isCrunchDay("2026-11-13", [open, open, open], "2026-11-13")).toBe(true);
    expect(isCrunchDay("2026-11-13", [open, open, open], "2026-11-14")).toBe(false);
  });

  it("an open deadline before today is overdue, a done one never is", () => {
    expect(isOverdue(open, "2026-11-14")).toBe(true);
    expect(isOverdue(open, "2026-11-13")).toBe(false);
    expect(isOverdue({ ...open, done: true }, "2026-11-14")).toBe(false);
  });
});
