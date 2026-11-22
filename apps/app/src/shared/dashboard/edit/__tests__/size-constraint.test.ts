import * as fc from "fast-check";
import type { ConstraintContext, LayoutItem } from "react-grid-layout/core";
import { describe, expect, it } from "vitest";
import { type BlockSizing, type GridColumns, resizeBounds, sizeAt } from "../../block-size";
import { resize, steppedStored } from "../../layout-commands";
import { type GridMetrics, rowsPerUnit } from "../edit-geometry";
import {
  boundedLayout,
  casesOfSpan,
  pulledSize,
  resizedSize,
  sizeConstraint,
} from "../size-constraint";

const PHONE: GridMetrics = { cols: 1, rowHeight: 168, gap: 16 };

const TABLET: GridMetrics = { cols: 2, rowHeight: 176, gap: 20 };

const DESKTOP: GridMetrics = { cols: 4, rowHeight: 208, gap: 20 };

const TONIGHT: BlockSizing = {
  bounds: { minW: 1, maxW: 2, minH: 1, maxH: 3 },
  defaultSize: { w: 2, h: 1 },
};

const AGENDA: BlockSizing = {
  bounds: { minW: 2, maxW: 4, minH: 2, maxH: 4 },
  defaultSize: { w: 4, h: 2 },
  raisedAt: [{ columns: 2, minH: 3 }],
};

function constrain(metrics: GridMetrics, w: number, h: number, sizing = TONIGHT) {
  const item: LayoutItem = { i: "tonight", x: 0, y: 0, w: 1, h: rowsPerUnit(metrics) };
  const context: ConstraintContext = {
    cols: metrics.cols,
    maxRows: Number.POSITIVE_INFINITY,
    containerWidth: 1232,
    containerHeight: 0,
    rowHeight: metrics.rowHeight,
    margin: [metrics.gap, metrics.gap],
    layout: [item],
  };

  return sizeConstraint(() => sizing, metrics).constrainSize?.(item, w, h, "se", context);
}

const sizingArb: fc.Arbitrary<BlockSizing> = fc
  .record({ minW: fc.integer({ min: 1, max: 4 }), minH: fc.integer({ min: 1, max: 3 }) })
  .chain(({ minW, minH }) =>
    fc.record({
      bounds: fc.record({
        minW: fc.constant(minW),
        minH: fc.constant(minH),
        maxW: fc.integer({ min: minW, max: 4 }),
        maxH: fc.integer({ min: minH, max: 4 }),
      }),
      defaultSize: fc.constant({ w: minW, h: minH }),
    }),
  );

const metricsArb = fc.constantFrom<GridMetrics>(PHONE, TABLET, { ...DESKTOP, cols: 3 }, DESKTOP);

describe("a resized block snaps to the nearest case within its bounds", () => {
  it("given any drag, then the size lands on whole cases, within the bounds and the columns, as near as they allow", async () => {
    await fc.assert(
      fc.property(
        metricsArb,
        sizingArb,
        fc.integer({ min: 0, max: 6 }),
        fc.double({ min: 0, max: 6, noNaN: true }),
        (metrics, sizing, w, rows) => {
          const step = rowsPerUnit(metrics);
          const h = Math.round(rows * step);
          const span = constrain(metrics, w, h, sizing);
          if (!span) throw new Error("The constraint gives no size.");

          const cols: GridColumns = metrics.cols;
          const { bounds } = sizing;
          const maxW = Math.min(bounds.maxW, cols);
          const minW = Math.min(bounds.minW, cols);
          const cases = span.h / step;

          expect(Number.isInteger(cases)).toBe(true);
          expect(span.w).toBe(Math.min(Math.max(w, minW), maxW));
          expect(cases).toBe(Math.min(Math.max(Math.round(h / step), bounds.minH), bounds.maxH));
        },
      ),
    );
  });

  it("given a desktop corner drag past the middle of a row, when it snaps, then it takes that row", () => {
    expect(constrain(DESKTOP, 2, 2)).toEqual({ w: 2, h: 2 });
    expect(constrain(DESKTOP, 4, 9)).toEqual({ w: 2, h: 3 });
    expect(constrain(DESKTOP, 0, 0)).toEqual({ w: 1, h: 1 });
  });

  it("given a phone, where rows are a pixel high, when dragged past half a row, then it snaps to whole cases", () => {
    const step = rowsPerUnit(PHONE);

    expect(constrain(PHONE, 1, Math.round(step * 1.6))).toEqual({ w: 1, h: step * 2 });
    expect(constrain(PHONE, 1, Math.round(step * 1.4))).toEqual({ w: 1, h: step });
  });

  it("given the Agenda on a tablet, where it asks for three rows, when sized to two, then it snaps to three", () => {
    expect(constrain(TABLET, 2, 2, AGENDA)).toEqual({ w: 2, h: 3 });
    expect(constrain(DESKTOP, 2, 2, AGENDA)).toEqual({ w: 2, h: 2 });
  });
});

describe("casesOfSpan", () => {
  it("given grid spans, when read back, then they give the size in cases", () => {
    expect(casesOfSpan(2, 2, DESKTOP)).toEqual({ w: 2, h: 2 });
    expect(casesOfSpan(1, rowsPerUnit(PHONE) * 3, PHONE)).toEqual({ w: 1, h: 3 });
  });
});

describe("resizedSize", () => {
  it("given a tile packed wider than its bound, when a handle moves only its height, then the size kept is held within its bounds", () => {
    const metrics = { ...DESKTOP, cols: 3 } as const;
    expect(resizedSize({ w: 3, h: 2 }, TONIGHT, metrics)).toEqual({ w: 2, h: 2 });
  });
});

describe("a handle pulled on a tile", () => {
  const step = rowsPerUnit(PHONE);
  const start = { id: "tonight", h: step, drawn: { w: 1, h: 1 } };

  it("given a drag shorter than half a case, then the tile keeps its size, past half it takes the case", () => {
    expect(pulledSize(start, { w: 1, h: step + step * 0.4 }, TONIGHT, PHONE)).toEqual({
      w: 1,
      h: 1,
    });
    expect(pulledSize(start, { w: 1, h: step - step * 0.4 }, TONIGHT, PHONE)).toEqual({
      w: 1,
      h: 1,
    });
    expect(pulledSize(start, { w: 1, h: step * 1.6 }, TONIGHT, PHONE)).toEqual({ w: 1, h: 2 });
  });

  it("given the Agenda drawn at the height of its week on a phone, when a handle moves a pixel, then the layout keeps its size for every width", () => {
    const stored = { w: 4, h: 2 };
    const drawn = sizeAt(stored, AGENDA, 1);
    const home = [{ id: "calendar", size: stored }];
    const week = { id: "calendar", h: 700, drawn };

    const pulled = pulledSize(week, { w: 1, h: 701 }, AGENDA, PHONE);

    expect(resize(home, "calendar", drawn, pulled)).toBe(home);
  });

  it("given the Agenda drawn at the height of its week on a phone, then no handle, key or menu item changes its height", () => {
    const drawn = sizeAt({ w: 4, h: 2 }, AGENDA, 1);
    const bounds = resizeBounds(AGENDA, 1, drawn.h);
    const slot = { item: { i: "calendar", x: 0, y: 0, w: 1, h: 700 }, units: drawn };
    const [tile] = boundedLayout([slot], () => AGENDA, PHONE, { id: "calendar", px: 684 });

    expect(tile?.isResizable).toBe(false);
    expect([tile?.minH, tile?.maxH]).toEqual([700, 700]);
    for (const step of [1, -1] as const)
      expect(steppedStored({ w: 4, h: 2 }, drawn, { axis: "h", step }, bounds)).toBeUndefined();
  });
});
