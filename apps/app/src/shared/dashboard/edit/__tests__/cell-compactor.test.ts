import type { LayoutItem } from "react-grid-layout";
import { describe, expect, it, vi } from "vitest";
import { type BlockSize, pack, toGrid } from "../../dashboard-pack";
import { createCellCompactor } from "../cell-compactor";
import { editGeometry, type GridMetrics } from "../edit-geometry";

const TABLET: GridMetrics = { cols: 8, rowHeight: 176, gap: 20 };

const PHONE: GridMetrics = { cols: 4, rowHeight: 168, gap: 16 };

const EIGHT_SMALL = ["a", "b", "c", "d", "e", "f", "g", "h"];

function setup(order: readonly string[], metrics: GridMetrics, size: BlockSize = "s") {
  const onIndexChange = vi.fn();
  const active: { current: string | null } = { current: null };
  const refs = {
    order: { current: order },
    active,
    metrics: { current: metrics },
    agendaPx: { current: undefined },
    sizeOf: { current: (): BlockSize => size },
    onIndexChange: { current: onIndexChange },
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

const SMALL_TABLET = { w: 2, h: 1 };

describe("createCellCompactor", () => {
  it("given no block held, when it compacts, then the output is the exact pack", () => {
    const { compactor } = setup(EIGHT_SMALL, TABLET);

    expect(compactor.compact([], 8)).toEqual(toGrid(pack(EIGHT_SMALL, () => "s", 4).items, 8));
  });

  it("given a block dragged right across two units, when each step compacts, then it takes their places in order", () => {
    const harness = setup(EIGHT_SMALL, TABLET);

    for (const x of [1, 2, 3, 4]) dragTo(harness, { i: "a", x, y: 0 }, SMALL_TABLET);

    expect(harness.compactor.currentOrder()).toEqual(["b", "c", "d", "e", "a", "f", "g", "h"]);
    expect(harness.onIndexChange.mock.calls).toEqual([
      ["a", 1],
      ["a", 4],
    ]);
  });

  it("given a block just past a neighbour's edge, when the centre has not crossed its middle, then the order holds", () => {
    const harness = setup(EIGHT_SMALL, TABLET);

    dragTo(harness, { i: "a", x: 1, y: 0 }, SMALL_TABLET);

    expect(harness.compactor.currentOrder()).toEqual(EIGHT_SMALL);
  });

  it("given a block wiggling across a neighbour's edge, when each wiggle compacts, then the order never flips", () => {
    const harness = setup(["a", "b", "c"], PHONE, "m");

    for (const y of [93, 91, 93, 91, 93]) dragTo(harness, { i: "a", x: 0, y }, { w: 4, h: 184 });

    expect(harness.compactor.currentOrder()).toEqual(["a", "b", "c"]);
    expect(harness.onIndexChange).not.toHaveBeenCalled();
  });

  it("given a phone in pixel rows, when a block is dragged down, then it moves only once its centre passes the middle below", () => {
    const harness = setup(["a", "b", "c"], PHONE, "m");
    const span = { w: 4, h: 184 };

    dragTo(harness, { i: "a", x: 0, y: 150 }, span);
    expect(harness.compactor.currentOrder()).toEqual(["a", "b", "c"]);

    dragTo(harness, { i: "a", x: 0, y: 184 }, span);
    expect(harness.compactor.currentOrder()).toEqual(["b", "a", "c"]);
  });

  it("given a drag released, when the next compaction has no block held, then it packs the validated order", () => {
    const harness = setup(EIGHT_SMALL, TABLET);
    dragTo(harness, { i: "a", x: 2, y: 0 }, SMALL_TABLET);

    harness.refs.active.current = null;

    expect(harness.compactor.compact([], 8)).toEqual(
      toGrid(pack(EIGHT_SMALL, () => "s", 4).items, 8),
    );
    expect(harness.compactor.currentOrder()).toEqual(EIGHT_SMALL);
  });
});
