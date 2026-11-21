import { describe, expect, it } from "vitest";
import type { BlockSize } from "../../block-size";
import { pack, toGrid } from "../../dashboard-pack";
import { editGeometry, editGridConfig, type GridMetrics } from "../edit-geometry";

const PHONE: GridMetrics = { cols: 1, rowHeight: 168, gap: 16 };

const DESKTOP: GridMetrics = { cols: 4, rowHeight: 208, gap: 20 };

const SIZES: Record<string, BlockSize> = {
  calendar: { w: 4, h: 2 },
  today: { w: 2, h: 2 },
  tonight: { w: 2, h: 1 },
  review: { w: 2, h: 1 },
};

const sizeOf = (id: string): BlockSize => SIZES[id] ?? { w: 1, h: 1 };

const ORDER = ["calendar", "today", "tonight", "review"];

const AGENDA = { id: "calendar", px: 900 };

describe("editGeometry", () => {
  it("given a desktop width, when the edit geometry is built, then it is the reading pack", () => {
    expect(editGeometry(ORDER, sizeOf, DESKTOP, AGENDA)).toEqual(
      toGrid(
        pack(
          ORDER.map((id) => ({ id, size: sizeOf(id) })),
          4,
        ),
      ),
    );
  });

  it("given a phone, when the edit geometry is built, then rows are pixels with the flowing tile at its measured height", () => {
    expect(editGeometry(ORDER, sizeOf, PHONE, AGENDA)).toEqual([
      { i: "calendar", x: 0, y: 0, w: 1, h: 916 },
      { i: "today", x: 0, y: 916, w: 1, h: 368 },
      { i: "tonight", x: 0, y: 1284, w: 1, h: 184 },
      { i: "review", x: 0, y: 1468, w: 1, h: 184 },
    ]);
  });

  it("given a phone and no measured height, when the geometry is built, then the agenda keeps its unit rows", () => {
    expect(editGeometry(ORDER, sizeOf, PHONE)[0]).toEqual({
      i: "calendar",
      x: 0,
      y: 0,
      w: 1,
      h: 368,
    });
  });
});

describe("editGridConfig", () => {
  it("given a phone, when configured, then rows are one pixel and the gutter sits in the tile", () => {
    expect(editGridConfig(PHONE)).toEqual({
      cols: 1,
      rowHeight: 1,
      margin: [16, 0],
      containerPadding: [0, 0],
      tileGap: 16,
    });
  });

  it("given a desktop, when configured, then rows and gutters come from the tokens", () => {
    expect(editGridConfig(DESKTOP)).toEqual({
      cols: 4,
      rowHeight: 208,
      margin: [20, 20],
      containerPadding: [0, 0],
      tileGap: 0,
    });
  });
});
