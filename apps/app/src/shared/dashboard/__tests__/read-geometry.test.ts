import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { BlockSizing, GridColumns } from "../block-size";
import { pack } from "../dashboard-pack";
import type { LayoutBlock } from "../layout-migration";
import { drawnSizeIn, readGeometry } from "../read-geometry";

const HOME: LayoutBlock[] = [
  { id: "today", size: { w: 2, h: 2 } },
  { id: "calendar", size: { w: 4, h: 2 } },
  { id: "review", size: { w: 2, h: 1 } },
  { id: "overdue", size: { w: 2, h: 1 } },
];

const FLOWING = new Set(["calendar"]);

const AGENDA: BlockSizing = {
  bounds: { minW: 2, maxW: 4, minH: 2, maxH: 4 },
  defaultSize: { w: 4, h: 2 },
  raisedAt: [{ columns: 2, minH: 3 }],
};

const sizingOf = (id: string) => (id === "calendar" ? AGENDA : undefined);

function rowsOf(geometry: ReturnType<typeof readGeometry>) {
  return Object.fromEntries(geometry.tiles.map(({ i, y, h }) => [i, { y, h }]));
}

describe("the home read on a grid", () => {
  it("given the Agenda on a phone, it takes one row as high as its content and the next blocks start under it", () => {
    const geometry = readGeometry(HOME, 1, FLOWING);

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
    const geometry = readGeometry(HOME, 2, FLOWING);

    expect(geometry.tracks).toBeUndefined();
    expect(rowsOf(geometry).calendar).toEqual({ y: 2, h: 2 });
  });

  it("given the Agenda's bounds, then it takes three rows on a tablet, where a row is short, and two elsewhere", () => {
    const agenda: LayoutBlock[] = [{ id: "calendar", size: { w: 2, h: 2 } }, ...HOME.slice(2)];
    const rowsAt = (columns: GridColumns) =>
      rowsOf(readGeometry(agenda, columns, FLOWING, sizingOf));

    expect(rowsAt(2).calendar).toEqual({ y: 0, h: 3 });
    expect(rowsAt(2).review).toEqual({ y: 3, h: 1 });
    expect(rowsAt(3).calendar?.h).toBe(2);
    expect(rowsAt(4).calendar?.h).toBe(2);
  });

  it("given an Agenda saved four wide, then a narrower grid draws it on as many rows as its surface needs", () => {
    const rowsAt = (columns: GridColumns) => rowsOf(readGeometry(HOME, columns, FLOWING, sizingOf));

    expect(rowsAt(2).calendar).toEqual({ y: 2, h: 4 });
    expect(rowsAt(3).calendar?.h).toBe(3);
    expect(rowsAt(4).calendar?.h).toBe(2);
  });
});

const orderArb = fc
  .uniqueArray(fc.integer({ min: 0, max: 40 }), { minLength: 1, maxLength: 16 })
  .chain((ids) =>
    fc.tuple(
      ...ids.map((id) =>
        fc.record({
          id: fc.constant(`b${id}`),
          size: fc.record({ w: fc.integer({ min: 1, max: 4 }), h: fc.integer({ min: 1, max: 3 }) }),
        }),
      ),
    ),
  );

const columnsArb = fc.constantFrom<GridColumns>(1, 2, 3, 4);

describe("the home is read in the rectangles it is packed in", () => {
  it("given any order and columns, every tile is the rectangle pack gives it", () => {
    fc.assert(
      fc.property(orderArb, columnsArb, (order, columns) => {
        const packed = pack(order, columns).map(({ id: i, x, y, w, h }) => ({ i, x, y, w, h }));

        expect(readGeometry(order, columns, new Set()).tiles).toEqual(packed);
      }),
    );
  });

  it("given any tile, the size it reads its content by is the rectangle it is drawn in", () => {
    fc.assert(
      fc.property(orderArb, columnsArb, (order, columns) => {
        const { tiles, sizes } = readGeometry(order, columns, new Set());

        for (const { i, w, h } of tiles) expect(sizes.get(i)).toEqual({ w, h });
      }),
    );
  });

  it("given the Agenda flowing on a phone, it still reads its content by the rows of its size", () => {
    const geometry = readGeometry(HOME, 1, FLOWING);

    expect(geometry.sizes.get("calendar")).toEqual({ w: 1, h: 2 });
  });
});

describe("the size a block is drawn at", () => {
  it("given two blocks that leave a hole on three columns, then the first is drawn wider than kept, as the grid shows it", () => {
    const pair: LayoutBlock[] = [
      { id: "a", size: { w: 2, h: 1 } },
      { id: "b", size: { w: 2, h: 1 } },
    ];

    expect(drawnSizeIn(pair, "a", 3)).toEqual({ w: 3, h: 1 });
    expect(drawnSizeIn(pair, "a", 3)).toEqual(readGeometry(pair, 3, new Set()).sizes.get("a"));
    expect(drawnSizeIn(pair, "z", 3)).toBeUndefined();
  });
});
