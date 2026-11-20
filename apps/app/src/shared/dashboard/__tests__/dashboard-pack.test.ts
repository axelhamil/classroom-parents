import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BLOCK_SIZES,
  type BlockSize,
  type GridUnits,
  type PackedItem,
  pack,
  TABLET_COLUMNS,
  tallOnTablet,
  toGrid,
} from "../dashboard-pack";

const SPANS: Record<BlockSize, { w: number; h: number }> = {
  s: { w: 1, h: 1 },
  m: { w: 2, h: 1 },
  l: { w: 2, h: 2 },
  xl: { w: 4, h: 2 },
};

const EXACT_CELLS: readonly BlockSize[][] = [
  ["l"],
  ["m", "m"],
  ["m", "s", "s"],
  ["s", "s", "m"],
  ["s", "s", "s", "s"],
];

const sizesArb = fc.array(fc.constantFrom(...BLOCK_SIZES), { maxLength: 40 });

const unitsArb = fc.constantFrom<GridUnits>(2, 4);

const cellArb = fc.constantFrom(...EXACT_CELLS);

const exactPhoneArb = fc.array(fc.oneof(cellArb, fc.constant<BlockSize[]>(["xl"])), {
  maxLength: 10,
});

const exactWideArb = fc.array(
  fc.oneof(
    fc.constant<BlockSize[]>(["xl"]),
    fc.tuple(cellArb, cellArb).map(([left, right]) => [...left, ...right]),
  ),
  { maxLength: 6 },
);

function layoutOf(sizes: readonly BlockSize[]) {
  const order = sizes.map((_, index) => `b${index}`);
  const sizeOf = (id: string) => sizes[order.indexOf(id)] ?? "s";

  return { order, sizeOf };
}

function packSizes(sizes: readonly BlockSize[], units: GridUnits): PackedItem[] {
  const { order, sizeOf } = layoutOf(sizes);

  return pack(order, sizeOf, units).items;
}

function chosenSpan(size: BlockSize, units: GridUnits) {
  return size === "xl" && units === 2 ? SPANS.l : SPANS[size];
}

function coverage(items: readonly PackedItem[], units: GridUnits): number[] {
  const rows = Math.max(0, ...items.map(({ y, h }) => y + h));
  const covered = Array.from({ length: rows * units }, () => 0);

  for (const { x, y, w, h } of items)
    for (let row = y; row < y + h; row++)
      for (let col = x; col < x + w; col++) {
        const at = row * units + col;

        covered[at] = (covered[at] ?? 0) + 1;
      }

  return covered;
}

function cellRow({ y }: PackedItem): number {
  return Math.floor(y / 2);
}

function readsForward(items: readonly PackedItem[]): boolean {
  return items.every((item, index) => {
    const previous = items[index - 1];
    if (!previous) return true;

    const backwards = item.y < previous.y && item.x <= previous.x;

    return cellRow(item) >= cellRow(previous) && !backwards;
  });
}

function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const rest = list.filter((_, index) => index !== from);
  const item = list[from];
  if (item === undefined) return [...list];

  return [...rest.slice(0, to), item, ...rest.slice(to)];
}

/** Any sizes, with the first L or XL among them made tall. */
const tallArb = sizesArb
  .filter((sizes) => sizes.some((size) => size === "l" || size === "xl"))
  .map((sizes) => ({
    sizes,
    tall: `b${sizes.findIndex((size) => size === "l" || size === "xl")}`,
  }));

describe("a tall block takes one more row with the row of cells it sits in", () => {
  it("given a tall L or XL on the wide grid, then nothing overlaps or leaves a hole, the tall block is one row higher and everything below moves down by one row", async () => {
    await fc.assert(
      fc.property(tallArb, ({ sizes, tall }) => {
        const { order, sizeOf } = layoutOf(sizes);
        const base = pack(order, sizeOf, 4).items;
        const items = pack(order, sizeOf, 4, (id) => id === tall).items;
        const before = base.find(({ id }) => id === tall);
        const after = items.find(({ id }) => id === tall);
        if (!before || !after) throw new Error("the tall block is not packed");
        const bottom = before.y + before.h;

        expect(coverage(items, 4).every((count) => count === 1)).toBe(true);
        expect(items.map(({ id }) => id)).toEqual(base.map(({ id }) => id));
        expect(after).toEqual({ ...before, h: before.h + 1 });
        for (const [index, item] of items.entries()) {
          const was = base[index];
          if (!was) continue;

          if (was.y >= bottom) expect(item).toEqual({ ...was, y: was.y + 1 });
          else if (was.y + was.h < bottom) expect(item).toEqual(was);
          else expect(item.h).toBe(was.h + 1);
        }
      }),
    );
  });

  it("given the table's tall sizes, then a block is tall only on a tablet and only at those sizes", () => {
    const sizes: Record<string, BlockSize> = { calendar: "l", notes: "l" };
    const tallSizesOf = (id: string) => (id === "calendar" ? (["l", "xl"] as const) : []);
    const sizeOf = (id: string) => sizes[id] ?? "s";

    expect(tallOnTablet(tallSizesOf, sizeOf, TABLET_COLUMNS)("calendar")).toBe(true);
    expect(tallOnTablet(tallSizesOf, sizeOf, TABLET_COLUMNS)("notes")).toBe(false);
    expect(tallOnTablet(tallSizesOf, sizeOf, 12)("calendar")).toBe(false);
    expect(tallOnTablet(tallSizesOf, sizeOf, 4)("calendar")).toBe(false);
    expect(tallOnTablet(tallSizesOf, () => "m", TABLET_COLUMNS)("calendar")).toBe(false);
  });
});

describe("blocks are packed by cells of 2 x 2 units", () => {
  it("given any order and sizes, then every row is covered exactly once, without overlap or hole", async () => {
    await fc.assert(
      fc.property(sizesArb, unitsArb, (sizes, units) => {
        const items = packSizes(sizes, units);

        expect(items.every(({ x, w }) => x >= 0 && x + w <= units)).toBe(true);
        expect(coverage(items, units).every((count) => count === 1)).toBe(true);
      }),
    );
  });

  it("given any order, then the items come in reading order, the stored one and a pulled block only moves forward", async () => {
    await fc.assert(
      fc.property(sizesArb, unitsArb, (sizes, units) => {
        const { order } = layoutOf(sizes);
        const items = packSizes(sizes, units);
        const pulled = new Set(items.filter((item) => item.pulled).map(({ id }) => id));
        const read = items.map(({ id }) => id);

        expect(readsForward(items)).toBe(true);
        expect(read.filter((id) => !pulled.has(id))).toEqual(order.filter((id) => !pulled.has(id)));
        for (const id of pulled) {
          const overtaken = order
            .slice(0, order.indexOf(id))
            .filter((earlier) => read.indexOf(earlier) > read.indexOf(id));

          expect(overtaken.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it("given any order, then a block is never drawn under its chosen size and grown marks every change", async () => {
    await fc.assert(
      fc.property(sizesArb, unitsArb, (sizes, units) => {
        const { sizeOf } = layoutOf(sizes);

        for (const item of packSizes(sizes, units)) {
          const span = chosenSpan(sizeOf(item.id), units);

          expect(item.w).toBeGreaterThanOrEqual(span.w);
          expect(item.h).toBeGreaterThanOrEqual(span.h);
          expect(item.grown).toBe(item.w !== span.w || item.h !== span.h);
        }
      }),
    );
  });

  it("given exact cells, then pack lays them out as composed, without growing or pulling", async () => {
    const recipes = fc.oneof(
      exactPhoneArb.map((cells) => ({ units: 2 as const, cells })),
      exactWideArb.map((cells) => ({ units: 4 as const, cells })),
    );

    await fc.assert(
      fc.property(recipes, ({ units, cells }) => {
        const items = packSizes(cells.flat(), units);

        expect(items.some(({ grown, pulled }) => grown || pulled)).toBe(false);
      }),
    );
  });

  it("given the same input twice, then the layout is the same and the input is left untouched", async () => {
    await fc.assert(
      fc.property(sizesArb, unitsArb, (sizes, units) => {
        const { order, sizeOf } = layoutOf(sizes);
        const frozen = Object.freeze([...order]);

        expect(pack(frozen, sizeOf, units)).toEqual(pack(frozen, sizeOf, units));
        expect(frozen).toEqual(order);
      }),
    );
  });

  it("given blocks without XL, then the phone and the wide grid read them in the same order", async () => {
    const withoutXl = fc.array(fc.constantFrom<BlockSize>("s", "m", "l"), { maxLength: 40 });

    await fc.assert(
      fc.property(withoutXl, (sizes) => {
        const ids = (units: GridUnits) => packSizes(sizes, units).map(({ id }) => id);

        expect(ids(2)).toEqual(ids(4));
      }),
    );
  });

  it("given a block moved from i to j, then no row before the first row it touches changes", async () => {
    const moves = sizesArb
      .filter((sizes) => sizes.length > 1)
      .chain((sizes) =>
        fc.record({
          sizes: fc.constant(sizes),
          from: fc.nat(sizes.length - 1),
          to: fc.nat(sizes.length - 1),
        }),
      );

    await fc.assert(
      fc.property(moves, unitsArb, ({ sizes, from, to }, units) => {
        const { order, sizeOf } = layoutOf(sizes);
        const before = pack(order, sizeOf, units).items;
        const after = pack(moved(order, from, to), sizeOf, units).items;
        const tail = new Set(order.slice(Math.min(from, to)));
        const firstTouched = Math.min(
          ...[...before, ...after].filter(({ id }) => tail.has(id)).map(cellRow),
        );
        const untouched = (items: PackedItem[]) =>
          items.filter((item) => cellRow(item) < firstTouched);

        expect(untouched(after)).toEqual(untouched(before));
      }),
    );
  });
});

describe("cells that cannot be completed", () => {
  it("given a small block that no longer fits, then the next small block is pulled into the cell", () => {
    const items = packSizes(["s", "m", "s"], 2);

    expect(items.map(({ id, pulled }) => [id, pulled])).toEqual([
      ["b0", false],
      ["b2", true],
      ["b1", false],
    ]);
  });

  it("given a lone small block on the last cell, then it grows down then right to fill it", () => {
    expect(packSizes(["l", "s"], 2).at(-1)).toMatchObject({ w: 2, h: 2, grown: true });
  });

  it("given a large block alone on the last wide row, then it doubles its width", () => {
    expect(packSizes(["l"], 4)).toEqual([
      { id: "b0", x: 0, y: 0, w: 4, h: 2, grown: true, pulled: false },
    ]);
  });

  it("given a cell left empty before a very large block, then the next block that fits is pulled into it", () => {
    const items = packSizes(["l", "xl", "l"], 4);

    expect(items.map(({ id, x, y, pulled }) => ({ id, x, y, pulled }))).toEqual([
      { id: "b0", x: 0, y: 0, pulled: false },
      { id: "b2", x: 2, y: 0, pulled: true },
      { id: "b1", x: 0, y: 2, pulled: false },
    ]);
  });
});

describe("packed units become grid columns", () => {
  it("given the phone, tablet and desktop grids, then one unit spans 2, 2 and 3 columns", () => {
    const items = packSizes(["l", "m", "s", "s"], 4);

    expect(toGrid(items, 8)[1]).toEqual({ i: "b1", x: 4, y: 0, w: 4, h: 1 });
    expect(toGrid(items, 12)[1]).toEqual({ i: "b1", x: 6, y: 0, w: 6, h: 1 });
    expect(toGrid(packSizes(["m"], 2), 4)[0]).toMatchObject({ x: 0, w: 4 });
  });
});
