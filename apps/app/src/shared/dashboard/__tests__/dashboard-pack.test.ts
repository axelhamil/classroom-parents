import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { BlockSize, GridColumns } from "../block-size";
import { type PackEntry, type Placed, pack } from "../dashboard-pack";

const MAX_HEIGHT = 4;

const columnsArb = fc.constantFrom<GridColumns>(1, 2, 3, 4);

const sizeArb: fc.Arbitrary<BlockSize> = fc.record({
  w: fc.integer({ min: 1, max: 4 }),
  h: fc.integer({ min: 1, max: MAX_HEIGHT }),
});

const sizesArb = fc.array(sizeArb, { minLength: 1, maxLength: 40 });

function entriesOf(sizes: readonly BlockSize[]): PackEntry[] {
  return sizes.map((size, index) => ({ id: `b${index}`, size }));
}

function packSizes(sizes: readonly BlockSize[], columns: GridColumns): Placed[] {
  return pack(entriesOf(sizes), columns);
}

function coverage(items: readonly Placed[], columns: number): number[][] {
  const rows = Math.max(0, ...items.map(({ y, h }) => y + h));
  const grid = Array.from({ length: rows }, () => Array.from({ length: columns }, () => 0));

  for (const { x, y, w, h } of items)
    for (let row = y; row < y + h; row++)
      for (let col = x; col < x + w; col++) {
        const line = grid[row];
        if (line) line[col] = (line[col] ?? 0) + 1;
      }

  return grid;
}

function columnBottom(items: readonly Placed[], column: number): number {
  const inColumn = items.filter(({ x, w }) => x <= column && column < x + w);

  return Math.max(0, ...inColumn.map(({ y, h }) => y + h));
}

function indexOf(id: string): number {
  return Number(id.slice(1));
}

function before(a: Placed, b: Placed): boolean {
  return a.y < b.y || (a.y === b.y && a.x < b.x);
}

const enlargedArb = fc.tuple(sizesArb, columnsArb).chain(([sizes, columns]) =>
  fc.record({
    sizes: fc.constant(sizes),
    columns: fc.constant(columns),
    k: fc.nat(sizes.length - 1),
    wider: fc.boolean(),
  }),
);

describe("blocks are packed as free rectangles on 1 to 4 columns of cards", () => {
  it("given any sizes and columns, then no rectangle overlaps another or leaves the columns", async () => {
    await fc.assert(
      fc.property(sizesArb, columnsArb, (sizes, columns) => {
        const items = packSizes(sizes, columns);

        expect(items.every(({ x, w }) => x >= 0 && x + w <= columns)).toBe(true);
        expect(
          coverage(items, columns)
            .flat()
            .every((count) => count <= 1),
        ).toBe(true);
      }),
    );
  });

  it("given any sizes and columns, then every case above the bottom of its column is covered: no hole", async () => {
    await fc.assert(
      fc.property(sizesArb, columnsArb, (sizes, columns) => {
        const items = packSizes(sizes, columns);
        const grid = coverage(items, columns);

        for (let column = 0; column < columns; column++)
          for (let row = 0; row < columnBottom(items, column); row++)
            expect(grid[row]?.[column]).toBe(1);
      }),
    );
  });

  it("given any sizes, then the items come in reading order", async () => {
    await fc.assert(
      fc.property(sizesArb, columnsArb, (sizes, columns) => {
        const items = packSizes(sizes, columns);

        expect(items.every((item, at) => at === 0 || before(items[at - 1] ?? item, item))).toBe(
          true,
        );
      }),
    );
  });

  it("given any sizes, then a width is held to the columns and a block is never drawn under its size", async () => {
    await fc.assert(
      fc.property(sizesArb, columnsArb, (sizes, columns) => {
        for (const item of packSizes(sizes, columns)) {
          const chosen = sizes[indexOf(item.id)] ?? { w: 1, h: 1 };
          const held = { w: Math.min(chosen.w, columns), h: chosen.h };

          expect(item.w).toBeLessThanOrEqual(columns);
          expect(item.w).toBeGreaterThanOrEqual(held.w);
          expect(item.h).toBeGreaterThanOrEqual(held.h);
        }
      }),
    );
  });

  it("given a block made larger, then nothing that ends above the first row it or a later block reaches changes", async () => {
    await fc.assert(
      fc.property(enlargedArb, ({ sizes, columns, k, wider }) => {
        const larger = sizes.map((size, index) =>
          index !== k ? size : wider ? { ...size, w: size.w + 1 } : { ...size, h: size.h + 1 },
        );
        const was = packSizes(sizes, columns);
        const now = packSizes(larger, columns);
        const reached = Math.min(
          ...[...was, ...now].filter(({ id }) => indexOf(id) >= k).map(({ y }) => y),
        );
        const above = (items: Placed[]) => items.filter(({ y, h }) => y + h < reached);

        expect(above(now)).toEqual(above(was));
      }),
    );
  });

  it("given any sizes, then the first block stands first at the top left", async () => {
    await fc.assert(
      fc.property(sizesArb, columnsArb, (sizes, columns) => {
        expect(packSizes(sizes, columns)[0]).toMatchObject({ id: "b0", x: 0, y: 0 });
      }),
    );
  });

  it("given rows composed to fill the width, then pack lays them out as composed, without growing or pulling", async () => {
    const rowArb = (columns: GridColumns) =>
      fc.integer({ min: 1, max: MAX_HEIGHT }).chain((h) =>
        fc
          .array(fc.integer({ min: 1, max: columns }), { minLength: 1, maxLength: columns })
          .filter((widths) => widths.reduce((sum, w) => sum + w, 0) === columns)
          .map((widths) => widths.map((w) => ({ w, h }))),
      );
    const composed = columnsArb.chain((columns) =>
      fc.record({
        columns: fc.constant(columns),
        rows: fc.array(rowArb(columns), { minLength: 1, maxLength: 8 }),
      }),
    );

    await fc.assert(
      fc.property(composed, ({ columns, rows }) => {
        const sizes = rows.flat();
        const items = packSizes(sizes, columns);

        expect(items.map(({ id, w, h }) => ({ id, w, h }))).toEqual(
          entriesOf(sizes).map(({ id, size }) => ({ id, ...size })),
        );
      }),
    );
  });

  it("given the same input twice, then the layout is the same and the input is left untouched", async () => {
    await fc.assert(
      fc.property(sizesArb, columnsArb, (sizes, columns) => {
        const entries = Object.freeze(entriesOf(sizes).map((entry) => Object.freeze(entry)));

        expect(pack(entries, columns)).toEqual(pack(entries, columns));
      }),
    );
  });
});

describe("a row that cannot be completed", () => {
  it("given a block too wide for what is left of the row, then the next block that fits is pulled into it", () => {
    const items = packSizes(
      [
        { w: 1, h: 1 },
        { w: 2, h: 1 },
        { w: 1, h: 1 },
      ],
      2,
    );

    expect(items.map(({ id, x, y }) => ({ id, x, y }))).toEqual([
      { id: "b0", x: 0, y: 0 },
      { id: "b2", x: 1, y: 0 },
      { id: "b1", x: 0, y: 1 },
    ]);
  });

  it("given nothing left to pull, then the block before the hole grows into it", () => {
    const items = packSizes(
      [
        { w: 1, h: 1 },
        { w: 2, h: 1 },
      ],
      2,
    );

    expect(items[0]).toMatchObject({ id: "b0", w: 2, h: 1 });
  });

  it("given a block wider than the grid, then it takes the whole width", () => {
    expect(packSizes([{ w: 4, h: 2 }], 2)).toEqual([{ id: "b0", x: 0, y: 0, w: 2, h: 2 }]);
  });
});
