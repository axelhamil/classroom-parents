import * as fc from "fast-check";
import type { Layout, LayoutItem } from "react-grid-layout";
import { describe, expect, it, vi } from "vitest";
import type { BlockSize, GridColumns } from "../../block-size";
import { pack, toGrid } from "../../dashboard-pack";
import { createCellCompactor } from "../cell-compactor";
import { editGeometry, type GridMetrics } from "../edit-geometry";

const WIDE: GridMetrics = { cols: 4, rowHeight: 208, gap: 20 };

const PHONE: GridMetrics = { cols: 1, rowHeight: 168, gap: 16 };

const EIGHT_SMALL = ["a", "b", "c", "d", "e", "f", "g", "h"];

const ONE_CASE = { w: 1, h: 1 };

const PHONE_ROW = { w: 1, h: 184 };

function packedSmall(order: readonly string[]) {
  return toGrid(
    pack(
      order.map((id) => ({ id, size: ONE_CASE })),
      4,
    ),
  );
}

const TWO_ACROSS = { w: 2, h: 1 };

function setup(order: readonly string[], metrics: GridMetrics, size: BlockSize = ONE_CASE) {
  const onIndexChange = vi.fn();
  const active: { current: string | null } = { current: null };
  const refs = {
    order: { current: order },
    active,
    metrics: { current: metrics },
    flow: { current: undefined },
    sizeOf: { current: (_id: string): BlockSize => size },
    onIndexChange: { current: onIndexChange },
    pinned: { current: [] as readonly string[] },
  };

  return { compactor: createCellCompactor(refs), refs, onIndexChange };
}

function dragTo(
  { compactor, refs }: ReturnType<typeof setup>,
  dragged: Omit<LayoutItem, "w" | "h">,
  span: { w: number; h: number },
) {
  refs.active.current = dragged.i;
  const layout = editGeometry(refs.order.current, refs.sizeOf.current, refs.metrics.current);

  return compactor.compact(
    layout.map((item) => (item.i === dragged.i ? { ...dragged, ...span } : item)),
    refs.metrics.current.cols,
  );
}

describe("createCellCompactor", () => {
  it("given no block held, when it compacts, then the output is the exact pack", () => {
    const { compactor } = setup(EIGHT_SMALL, WIDE);

    expect(compactor.compact([], 4)).toEqual(packedSmall(EIGHT_SMALL));
  });

  it("given a block dragged right across two columns, when each step compacts, then it takes their places in order", () => {
    const harness = setup(EIGHT_SMALL, WIDE);

    for (const x of [0.5, 1, 1.5, 2]) dragTo(harness, { i: "a", x, y: 0 }, ONE_CASE);

    expect(harness.compactor.currentOrder()).toEqual(["b", "c", "a", "d", "e", "f", "g", "h"]);
    expect(harness.onIndexChange.mock.calls).toEqual([
      ["a", 1],
      ["a", 2],
    ]);
  });

  it("given a pinned block, when another is dragged past it, then it holds its place all along", () => {
    const harness = setup(EIGHT_SMALL, WIDE);
    harness.refs.pinned.current = ["b"];

    for (const x of [0.5, 1, 1.5, 2]) {
      dragTo(harness, { i: "a", x, y: 0 }, ONE_CASE);
      expect(harness.compactor.currentOrder()[1]).toBe("b");
    }

    expect(harness.compactor.currentOrder()).toEqual(["c", "b", "a", "d", "e", "f", "g", "h"]);
    expect(harness.onIndexChange.mock.calls.at(-1)).toEqual(["a", 2]);
  });

  it("given a block just past a neighbour's edge, when the centre has not crossed its middle, then the order holds", () => {
    const harness = setup(EIGHT_SMALL, WIDE);

    dragTo(harness, { i: "a", x: 0.5, y: 0 }, ONE_CASE);

    expect(harness.compactor.currentOrder()).toEqual(EIGHT_SMALL);
  });

  it("given a block wiggling across a neighbour's edge, when each wiggle compacts, then the order never flips", () => {
    const harness = setup(["a", "b", "c"], PHONE, TWO_ACROSS);

    for (const y of [93, 91, 93, 91, 93]) dragTo(harness, { i: "a", x: 0, y }, PHONE_ROW);

    expect(harness.compactor.currentOrder()).toEqual(["a", "b", "c"]);
    expect(harness.onIndexChange).not.toHaveBeenCalled();
  });

  it("given a phone in pixel rows, when a block is dragged down, then it moves only once its centre passes the middle below", () => {
    const harness = setup(["a", "b", "c"], PHONE, TWO_ACROSS);
    dragTo(harness, { i: "a", x: 0, y: 150 }, PHONE_ROW);
    expect(harness.compactor.currentOrder()).toEqual(["a", "b", "c"]);

    dragTo(harness, { i: "a", x: 0, y: 184 }, PHONE_ROW);
    expect(harness.compactor.currentOrder()).toEqual(["b", "a", "c"]);
  });

  it("given a drag released, when the next compaction has no block held, then it packs the validated order", () => {
    const harness = setup(EIGHT_SMALL, WIDE);
    dragTo(harness, { i: "a", x: 1, y: 0 }, ONE_CASE);

    harness.refs.active.current = null;

    expect(harness.compactor.compact([], 4)).toEqual(packedSmall(EIGHT_SMALL));
    expect(harness.compactor.currentOrder()).toEqual(EIGHT_SMALL);
  });
});

const sizeArb = fc.record({ w: fc.integer({ min: 1, max: 4 }), h: fc.integer({ min: 1, max: 3 }) });

const WELCOME = "welcome";

const homeArb = fc
  .record({
    columns: fc.constantFrom<GridColumns>(2, 3, 4),
    welcome: fc.boolean(),
    sizes: fc.array(sizeArb, { minLength: 1, maxLength: 14 }),
  })
  .chain((home) =>
    fc.record({
      columns: fc.constant(home.columns),
      welcome: fc.constant(home.welcome),
      sizes: fc.constant(home.sizes),
      resized: fc.nat({ max: home.sizes.length - 1 }),
      to: sizeArb,
    }),
  );

function rows(layout: Layout): number {
  return Math.max(0, ...layout.map(({ y, h }) => y + h));
}

function covered(layout: Layout, x: number, y: number): LayoutItem[] {
  return layout.filter(
    (item) => item.x <= x && x < item.x + item.w && item.y <= y && y < item.y + item.h,
  );
}

describe("createCellCompactor while a block is resized", () => {
  it("given any home and any new size, then the grid has no overlap and no hole, the welcome keeps its corner, and nothing above the resized block moves or shrinks", async () => {
    await fc.assert(
      fc.property(homeArb, ({ columns, welcome, sizes, resized, to }) => {
        const ids = sizes.map((_, index) => `b${index}`);
        const order = welcome ? [WELCOME, ...ids] : ids;
        const live = new Map<string, BlockSize>(
          ids.map((id, index) => [id, sizes[index] ?? ONE_CASE]),
        );
        live.set(WELCOME, { w: 2, h: 2 });
        const metrics = { ...WIDE, cols: columns };
        const harness = setup(order, metrics);
        harness.refs.sizeOf.current = (id) => live.get(id) ?? ONE_CASE;
        harness.refs.pinned.current = [WELCOME];
        const before = harness.compactor.compact([], columns);

        const target = ids[resized] ?? "";
        live.set(target, to);
        const after = harness.compactor.compact([], columns);

        for (let y = 0; y < rows(after); y++)
          for (let x = 0; x < columns; x++) {
            const bottom = Math.max(
              0,
              ...after
                .filter((item) => item.x <= x && x < item.x + item.w)
                .map((item) => item.y + item.h),
            );
            if (y < bottom) expect(covered(after, x, y)).toHaveLength(1);
            else expect(covered(after, x, y).length).toBeLessThanOrEqual(1);
          }

        const greeting = after.find(({ i }) => i === WELCOME);
        if (welcome) {
          expect(greeting).toMatchObject({ x: 0, y: 0, isDraggable: false, isResizable: false });
          expect(greeting?.w).toBeGreaterThanOrEqual(2);
          expect(greeting?.h).toBeGreaterThanOrEqual(2);
        }

        const reached = Math.min(
          ...order
            .slice(order.indexOf(target))
            .flatMap((id) =>
              [before, after].map((layout) => layout.find(({ i }) => i === id)?.y ?? 0),
            ),
        );
        for (const item of before) {
          if (item.y + item.h > reached) continue;

          const now = after.find(({ i }) => i === item.i);
          expect(now).toMatchObject({ x: item.x, y: item.y, w: item.w });
          expect(now?.h).toBeGreaterThanOrEqual(item.h);
        }
      }),
      { numRuns: 400 },
    );
  });
});
