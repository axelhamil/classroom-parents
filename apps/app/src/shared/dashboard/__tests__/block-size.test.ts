import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type BlockSizing,
  type Bounds,
  boundsAt,
  boundsOnGrid,
  type GridColumns,
  sizeAt,
} from "../block-size";

const columnsArb = fc.constantFrom<GridColumns>(1, 2, 3, 4);

const boundsArb: fc.Arbitrary<Bounds> = fc
  .record({ minW: fc.integer({ min: 1, max: 4 }), minH: fc.integer({ min: 1, max: 4 }) })
  .chain(({ minW, minH }) =>
    fc.record({
      minW: fc.constant(minW),
      minH: fc.constant(minH),
      maxW: fc.integer({ min: minW, max: 4 }),
      maxH: fc.integer({ min: minH, max: 6 }),
    }),
  );

const sizingArb: fc.Arbitrary<BlockSizing> = boundsArb.map((bounds) => ({
  bounds,
  defaultSize: { w: bounds.minW, h: bounds.minH },
}));

const sizeArb = fc.record({ w: fc.integer({ min: 0, max: 8 }), h: fc.integer({ min: 0, max: 8 }) });

describe("a block is drawn within its bounds and the width of the grid", () => {
  it("given any size, bounds and columns, then the width stays within the bounds and the columns, the height within the bounds", async () => {
    await fc.assert(
      fc.property(sizeArb, sizingArb, columnsArb, (size, sizing, columns) => {
        const { w, h } = sizeAt(size, sizing, columns);
        const { bounds } = sizing;

        expect(w).toBeLessThanOrEqual(Math.min(bounds.maxW, columns));
        expect(w).toBeGreaterThanOrEqual(Math.min(bounds.minW, columns));
        expect(h).toBeGreaterThanOrEqual(bounds.minH);
        expect(h).toBeLessThanOrEqual(bounds.maxH);
      }),
    );
  });

  it("given a size already within the bounds and the columns, then it is drawn as is", async () => {
    await fc.assert(
      fc.property(sizingArb, columnsArb, (sizing, columns) => {
        const inside = { w: Math.min(sizing.bounds.maxW, columns), h: sizing.bounds.minH };

        expect(sizeAt(inside, sizing, columns)).toEqual(inside);
      }),
    );
  });

  it("given a block wider than the grid, then it is drawn as wide as the grid, as many cases high as its size holds, and its size is left alone", () => {
    const stored = { w: 4, h: 2 };
    const sizing: BlockSizing = {
      bounds: { minW: 1, maxW: 4, minH: 1, maxH: 3 },
      defaultSize: stored,
    };

    expect(sizeAt(stored, sizing, 2)).toEqual({ w: 2, h: 3 });
    expect(stored).toEqual({ w: 4, h: 2 });
    expect(sizeAt(stored, sizing, 4)).toEqual({ w: 4, h: 2 });
  });

  it("given a two-wide row on a phone, then it is drawn one wide on two rows, a one-case block staying one case", () => {
    const sizing: BlockSizing = {
      bounds: { minW: 1, maxW: 2, minH: 1, maxH: 3 },
      defaultSize: { w: 2, h: 1 },
    };

    expect(sizeAt({ w: 2, h: 1 }, sizing, 1)).toEqual({ w: 1, h: 2 });
    expect(sizeAt({ w: 1, h: 1 }, sizing, 1)).toEqual({ w: 1, h: 1 });
  });

  it("given any block wider than the grid, then it keeps its surface in height, up to its tallest", async () => {
    await fc.assert(
      fc.property(sizingArb, columnsArb, (sizing, columns) => {
        const { bounds } = sizing;
        const stored = { w: bounds.maxW, h: bounds.minH };
        const drawn = sizeAt(stored, sizing, columns);
        if (stored.w <= columns) return;

        expect(drawn.w).toBe(columns);
        expect(drawn.h).toBe(
          Math.min(bounds.maxH, Math.max(stored.h, Math.ceil((stored.w * stored.h) / columns))),
        );
      }),
    );
  });
});

describe("a block may need more rows where a row is short", () => {
  const sizing: BlockSizing = {
    bounds: { minW: 2, maxW: 4, minH: 2, maxH: 4 },
    defaultSize: { w: 4, h: 2 },
    raisedAt: [{ columns: 2, minH: 3 }],
  };

  it("given the columns it names, then its minimum height is raised there and only there", () => {
    const others: GridColumns[] = [1, 3, 4];

    expect(boundsAt(sizing, 2).minH).toBe(3);
    expect(others.map((columns) => boundsAt(sizing, columns).minH)).toEqual([2, 2, 2]);
  });

  it("given fewer columns than its bounds ask, then its width bounds stop at the columns", () => {
    expect(boundsOnGrid(sizing, 1)).toEqual({ minW: 1, maxW: 1, minH: 2, maxH: 4 });
    expect(boundsOnGrid(sizing, 3)).toEqual({ minW: 2, maxW: 3, minH: 2, maxH: 4 });
  });
});

describe("a block may need two columns where a column holds it on one row only", () => {
  const sizing: BlockSizing = {
    bounds: { minW: 1, maxW: 2, minH: 1, maxH: 3 },
    defaultSize: { w: 2, h: 1 },
    raisedAt: [
      { columns: 3, minH: 2 },
      { columns: 4, minW: 2 },
    ],
  };

  it("given the columns that raise its width, then one column is no longer offered there", () => {
    expect(boundsAt(sizing, 4)).toEqual({ minW: 2, maxW: 2, minH: 1, maxH: 3 });
    expect(boundsAt(sizing, 3)).toEqual({ minW: 1, maxW: 2, minH: 2, maxH: 3 });
    expect(sizeAt({ w: 1, h: 2 }, sizing, 4)).toEqual({ w: 2, h: 2 });
    expect(sizeAt({ w: 1, h: 2 }, sizing, 3)).toEqual({ w: 1, h: 2 });
  });
});
