import { describe, expect, it } from "vitest";
import type { LayoutBlock } from "../layout-migration";
import { readGeometry } from "../read-geometry";

const HOME: LayoutBlock[] = [
  { id: "today", size: "l" },
  { id: "calendar", size: "xl" },
  { id: "review", size: "m" },
  { id: "overdue", size: "m" },
];

const FLOWING = new Set(["calendar"]);

function rowsOf(geometry: ReturnType<typeof readGeometry>) {
  return Object.fromEntries(geometry.tiles.map(({ i, y, h }) => [i, { y, h }]));
}

describe("the home read on a grid", () => {
  it("given the Agenda on a phone, it takes one row as high as its content and the next blocks start under it", () => {
    const geometry = readGeometry(HOME, 4, FLOWING);

    expect(rowsOf(geometry)).toEqual({
      today: { y: 0, h: 2 },
      calendar: { y: 2, h: 1 },
      review: { y: 3, h: 1 },
      overdue: { y: 4, h: 1 },
    });
    expect(geometry.tracks?.split(" ")).toEqual([
      "var(--dashboard-row-height)",
      "var(--dashboard-row-height)",
      "auto",
      "var(--dashboard-row-height)",
      "var(--dashboard-row-height)",
    ]);
  });

  it("from a tablet up, the Agenda keeps the two rows of its size and every row is one step", () => {
    const geometry = readGeometry(HOME, 8, FLOWING);

    expect(geometry.tracks).toBeUndefined();
    expect(rowsOf(geometry).calendar).toEqual({ y: 2, h: 2 });
  });
});
