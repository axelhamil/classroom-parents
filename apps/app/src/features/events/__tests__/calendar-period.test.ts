import { describe, expect, it } from "vitest";
import { calendarPeriod, isCrunchDay, isOverdue, shiftAnchor } from "../calendar";

describe("calendarPeriod", () => {
  it("Agenda covers two weeks from the anchor day", () => {
    const period = calendarPeriod("agenda", "2026-11-12");

    expect([period.from, period.to]).toEqual(["2026-11-12", "2026-11-25"]);
    expect(period.days).toHaveLength(14);
  });

  it("Semaine runs Monday to Sunday around the anchor", () => {
    expect(calendarPeriod("week", "2026-11-12")).toMatchObject({
      from: "2026-11-09",
      to: "2026-11-15",
    });
    expect(calendarPeriod("week", "2026-11-15")).toMatchObject({
      from: "2026-11-09",
      to: "2026-11-15",
    });
  });

  it("Mois covers the six weeks its grid draws, under the 62 day range cap", () => {
    const period = calendarPeriod("month", "2026-11-12");

    expect([period.from, period.to]).toEqual(["2026-10-26", "2026-12-06"]);
    expect(period.days).toHaveLength(42);
  });
});

describe("shiftAnchor", () => {
  it("moves by the length of the visible period", () => {
    expect(shiftAnchor("agenda", "2026-11-12", 1)).toBe("2026-11-26");
    expect(shiftAnchor("week", "2026-11-12", -1)).toBe("2026-11-05");
    expect(shiftAnchor("month", "2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftAnchor("month", "2026-01-15", -1)).toBe("2025-12-01");
  });
});

describe("crunch and overdue", () => {
  const open = { done: false, deadlineDate: "2026-11-13" };

  it("a day is a crunch from three open deadlines, done ones do not count", () => {
    expect(isCrunchDay([open, open])).toBe(false);
    expect(isCrunchDay([open, open, { ...open, done: true }])).toBe(false);
    expect(isCrunchDay([open, open, open])).toBe(true);
  });

  it("an open deadline before today is overdue, a done one never is", () => {
    expect(isOverdue(open, "2026-11-14")).toBe(true);
    expect(isOverdue(open, "2026-11-13")).toBe(false);
    expect(isOverdue({ ...open, done: true }, "2026-11-14")).toBe(false);
  });
});
