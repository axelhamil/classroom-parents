import { describe, expect, it } from "vitest";
import { groupByDay, notificationDayLabel, notificationTimeLabel } from "../notification-days";

const LABELS = { today: "Aujourd'hui", yesterday: "Hier" };
const NOW = new Date("2026-11-19T10:00:00.000Z");

describe("notification days", () => {
  it("given notifications newest first, then they are grouped by Paris day in the same order", () => {
    const groups = groupByDay([
      { id: "a", createdAt: "2026-11-19T08:00:00.000Z" },
      { id: "b", createdAt: "2026-11-18T23:30:00.000Z" },
      { id: "c", createdAt: "2026-11-18T22:30:00.000Z" },
      { id: "d", createdAt: "2026-11-12T07:00:00.000Z" },
    ]);

    expect(groups.map(({ date, items }) => [date, items.map((item) => item.id)])).toEqual([
      ["2026-11-19", ["a", "b"]],
      ["2026-11-18", ["c"]],
      ["2026-11-12", ["d"]],
    ]);
  });

  it.each([
    ["2026-11-19", "Aujourd'hui"],
    ["2026-11-18", "Hier"],
    ["2026-11-12", "Jeudi 12 novembre"],
    ["2025-12-31", "Mercredi 31 décembre 2025"],
  ])("given the day %s, then its heading reads %s", (date, heading) => {
    expect(notificationDayLabel(date, NOW, LABELS)).toBe(heading);
  });

  it("given a notification created at 07:30 UTC in winter, then its time reads in Paris", () => {
    expect(notificationTimeLabel("2026-11-19T07:30:00.000Z")).toBe("8 h 30");
  });
});
