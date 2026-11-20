import type { ConstraintContext, LayoutItem } from "react-grid-layout/core";
import { describe, expect, it } from "vitest";
import type { BlockSize } from "../../dashboard-pack";
import type { GridMetrics } from "../edit-geometry";
import { sizeConstraint, sizeOfSpan } from "../size-constraint";

const PHONE: GridMetrics = { cols: 4, rowHeight: 168, gap: 16 };

const TABLET: GridMetrics = { cols: 8, rowHeight: 176, gap: 20 };

const DESKTOP: GridMetrics = { cols: 12, rowHeight: 208, gap: 20 };

const TONIGHT: readonly BlockSize[] = ["s", "m", "l"];

function resize(metrics: GridMetrics, w: number, h: number, allowed = TONIGHT) {
  const item: LayoutItem = { i: "tonight", x: 0, y: 0, w: 1, h: 1 };
  const context: ConstraintContext = {
    cols: metrics.cols,
    maxRows: Number.POSITIVE_INFINITY,
    containerWidth: 1232,
    containerHeight: 0,
    rowHeight: metrics.rowHeight,
    margin: [metrics.gap, metrics.gap],
    layout: [item],
  };

  return sizeConstraint(() => allowed, metrics).constrainSize?.(item, w, h, "se", context);
}

describe("sizeConstraint", () => {
  it("given a desktop corner drag, when the width passes half way between S and M, then it snaps to M", () => {
    expect(resize(DESKTOP, 4, 1)).toEqual({ w: 3, h: 1 });
    expect(resize(DESKTOP, 5, 1)).toEqual({ w: 6, h: 1 });
  });

  it("given a desktop corner drag, when the height passes half way, then M flips to L", () => {
    expect(resize(DESKTOP, 6, 2)).toEqual({ w: 6, h: 2 });
  });

  it("given a size the block does not allow, when dragged to it, then it snaps to the nearest allowed one", () => {
    expect(resize(DESKTOP, 12, 2)).toEqual({ w: 6, h: 2 });
    expect(resize(DESKTOP, 3, 1, ["m", "l"])).toEqual({ w: 6, h: 1 });
  });

  it("given a drag exactly between two sizes, when it snaps, then the larger wins", () => {
    expect(resize(TABLET, 3, 1)).toEqual({ w: 4, h: 1 });
  });

  it("given a phone in pixel rows, when the height passes half a unit, then it snaps to whole units", () => {
    expect(resize(PHONE, 4, 250)).toEqual({ w: 4, h: 184 });
    expect(resize(PHONE, 4, 300)).toEqual({ w: 4, h: 368 });
  });
});

describe("sizeOfSpan", () => {
  it("given grid spans, when read back, then they name their sizes", () => {
    expect(sizeOfSpan(3, 1, DESKTOP)).toBe("s");
    expect(sizeOfSpan(6, 2, DESKTOP)).toBe("l");
    expect(sizeOfSpan(12, 2, DESKTOP)).toBe("xl");
    expect(sizeOfSpan(4, 1, TABLET)).toBe("m");
    expect(sizeOfSpan(4, 368, PHONE)).toBe("l");
  });
});
