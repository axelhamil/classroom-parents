import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type BlockSize, type BlockSizing, boundsOnGrid, type GridColumns } from "../block-size";
import { editSlots } from "../edit/edit-geometry";
import {
  type Draft,
  hide,
  moveBy,
  moveToEdge,
  moveToRow,
  record,
  resize,
  show,
  steppedSize,
  steppedStored,
  stepSize,
  undo,
} from "../layout-commands";
import { drawnSizeIn } from "../read-geometry";

const ONE_BY_ONE = { w: 1, h: 1 };

const TWO_BY_ONE = { w: 2, h: 1 };

const TWO_BY_TWO = { w: 2, h: 2 };

const FOUR_BY_TWO = { w: 4, h: 2 };

function draftOf(...blocks: [string, BlockSize][]): Draft {
  return blocks.map(([id, size]) => ({ id, size }));
}

function idsOf(draft: Draft): string[] {
  return draft.map((block) => block.id);
}

const UNSIZED = () => undefined;

const FOUR = draftOf(["a", ONE_BY_ONE], ["b", ONE_BY_ONE], ["c", TWO_BY_ONE], ["d", TWO_BY_TWO]);

describe("moveBy", () => {
  it("given a middle block, when it moves by one, then it swaps with its neighbour", () => {
    expect(idsOf(moveBy(FOUR, "b", 1))).toEqual(["a", "c", "b", "d"]);
    expect(idsOf(moveBy(FOUR, "b", -1))).toEqual(["b", "a", "c", "d"]);
  });

  it("given a block at an edge, when it moves past it, then the draft is unchanged", () => {
    expect(moveBy(FOUR, "a", -1)).toBe(FOUR);
    expect(moveBy(FOUR, "d", 1)).toBe(FOUR);
  });
});

describe("moveToEdge", () => {
  it("given a block, when it moves to an edge, then it becomes first or last", () => {
    expect(idsOf(moveToEdge(FOUR, "c", "start"))).toEqual(["c", "a", "b", "d"]);
    expect(idsOf(moveToEdge(FOUR, "b", "end"))).toEqual(["a", "c", "d", "b"]);
  });

  it("given the first block, when it moves to the start, then the draft is unchanged", () => {
    expect(moveToEdge(FOUR, "a", "start")).toBe(FOUR);
  });
});

describe("moveToRow on 2 columns", () => {
  it("given a medium under two smalls, when it goes up, then it takes the place of the small under its centre", () => {
    expect(idsOf(moveToRow(FOUR, "c", "up", 2, UNSIZED))).toEqual(["a", "c", "b", "d"]);
  });

  it("given a small on the first row, when it goes down, then it takes the place of the block below", () => {
    expect(idsOf(moveToRow(FOUR, "a", "down", 2, UNSIZED))).toEqual(["b", "c", "a", "d"]);
  });

  it("given a block on the first or last row, when it leaves the grid, then the draft is unchanged", () => {
    expect(moveToRow(FOUR, "a", "up", 2, UNSIZED)).toBe(FOUR);
    expect(moveToRow(FOUR, "d", "down", 2, UNSIZED)).toBe(FOUR);
  });
});

describe("moveToRow on the rectangles drawn on screen", () => {
  const NOTES: BlockSizing = {
    bounds: { minW: 1, maxW: 2, minH: 1, maxH: 3 },
    defaultSize: TWO_BY_ONE,
    raisedAt: [{ columns: 3, minH: 2 }],
  };
  const sizingOf = (id: string) => (id === "notes" ? NOTES : undefined);
  const HOME = draftOf(
    ["notes", TWO_BY_ONE],
    ["b", ONE_BY_ONE],
    ["c", ONE_BY_ONE],
    ["d", ONE_BY_ONE],
  );

  it("given notes drawn two rows high at 3 columns, when the block under b goes up, then it takes the place of b", () => {
    expect(idsOf(moveToRow(HOME, "c", "up", 3, sizingOf))).toEqual(["notes", "c", "b", "d"]);
  });
});

describe("moveToRow on 4 columns", () => {
  const WIDE = draftOf(["x", FOUR_BY_TWO], ["a", TWO_BY_ONE], ["b", TWO_BY_ONE], ["c", TWO_BY_TWO]);

  it("given a large under two mediums, when it goes up, then it takes the place of the medium above its centre", () => {
    expect(idsOf(moveToRow(WIDE, "c", "up", 4, UNSIZED))).toEqual(["x", "c", "a", "b"]);
  });

  it("given a medium under a full row, when it goes up, then it takes the place of the full row", () => {
    expect(idsOf(moveToRow(WIDE, "b", "up", 4, UNSIZED))).toEqual(["b", "x", "a", "c"]);
  });

  it("given a full row, when it goes down, then it takes the place of the block under its centre", () => {
    expect(idsOf(moveToRow(WIDE, "x", "down", 4, UNSIZED))).toEqual(["a", "b", "x", "c"]);
  });
});

const SIZING: BlockSizing = {
  bounds: { minW: 1, maxW: 4, minH: 1, maxH: 3 },
  defaultSize: TWO_BY_ONE,
};

const ONE_ROW: BlockSizing = { ...SIZING, bounds: { ...SIZING.bounds, maxH: 1 } };

const WIDER = { axis: "w", step: 1 } as const;

const NARROWER = { axis: "w", step: -1 } as const;

const TALLER = { axis: "h", step: 1 } as const;

const SHORTER = { axis: "h", step: -1 } as const;

const AT_MOST_TWO: BlockSizing = { ...SIZING, bounds: { ...SIZING.bounds, maxW: 2 } };

describe("stepSize", () => {
  it("given the last block of a home shrunk by the parent, then it keeps that size read and arranged, the space after it left free", () => {
    const home = draftOf(["a", FOUR_BY_TWO], ["b", TWO_BY_ONE], ["c", TWO_BY_ONE]);
    const metrics = { cols: 4, rowHeight: 120, gap: 16 } as const;

    const shrunk = stepSize(home, "c", TWO_BY_ONE, NARROWER, boundsOnGrid(SIZING, 4));
    const sizeOf = (id: string) => shrunk.find((block) => block.id === id)?.size ?? ONE_BY_ONE;

    expect(shrunk[2]).toEqual({ id: "c", size: ONE_BY_ONE });
    expect(drawnSizeIn(shrunk, "c", 4)).toEqual(ONE_BY_ONE);
    expect(editSlots(["a", "b", "c"], sizeOf, metrics).at(-1)?.units).toEqual(ONE_BY_ONE);
  });

  it("given a block, when it is widened, narrowed, grown or shortened, then one side moves by one case", () => {
    expect(stepSize(FOUR, "c", TWO_BY_ONE, WIDER, boundsOnGrid(SIZING, 4))[2]).toEqual({
      id: "c",
      size: { w: 3, h: 1 },
    });
    expect(stepSize(FOUR, "c", TWO_BY_ONE, NARROWER, boundsOnGrid(SIZING, 4))[2]).toEqual({
      id: "c",
      size: ONE_BY_ONE,
    });
    expect(stepSize(FOUR, "c", TWO_BY_ONE, TALLER, boundsOnGrid(SIZING, 4))[2]).toEqual({
      id: "c",
      size: TWO_BY_TWO,
    });
    expect(stepSize(FOUR, "d", TWO_BY_TWO, SHORTER, boundsOnGrid(SIZING, 4))[3]).toEqual({
      id: "d",
      size: TWO_BY_ONE,
    });
  });

  it("given a block at a bound or as wide as the grid, when it steps past it, then the draft is unchanged", () => {
    expect(stepSize(FOUR, "a", ONE_BY_ONE, NARROWER, boundsOnGrid(SIZING, 4))).toBe(FOUR);
    expect(stepSize(FOUR, "a", ONE_BY_ONE, SHORTER, boundsOnGrid(SIZING, 4))).toBe(FOUR);
    expect(stepSize(FOUR, "c", TWO_BY_ONE, WIDER, boundsOnGrid(SIZING, 2))).toBe(FOUR);
    expect(stepSize(FOUR, "c", TWO_BY_ONE, TALLER, boundsOnGrid(ONE_ROW, 4))).toBe(FOUR);
  });

  it("given a block packed wider than its bound to leave no hole, when widened, then nothing is offered and the draft is unchanged", () => {
    const grown = { w: 3, h: 1 };

    expect(steppedSize(grown, WIDER, boundsOnGrid(AT_MOST_TWO, 3))).toBeUndefined();
    expect(
      stepSize(
        draftOf(["a", TWO_BY_ONE], ["b", TWO_BY_ONE]),
        "a",
        grown,
        WIDER,
        boundsOnGrid(AT_MOST_TWO, 3),
      ),
    ).toEqual(draftOf(["a", TWO_BY_ONE], ["b", TWO_BY_ONE]));
  });

  it("given a block packed wider than its bound, when narrowed or grown, then it steps from what is drawn, held within its bounds", () => {
    const bounds = boundsOnGrid(AT_MOST_TWO, 3);

    expect(steppedSize({ w: 3, h: 1 }, NARROWER, bounds)).toEqual(TWO_BY_ONE);
    expect(steppedSize({ w: 3, h: 1 }, TALLER, bounds)).toEqual(TWO_BY_TWO);
  });

  it("given any steps from what is drawn, then the size stays within the bounds and the columns", async () => {
    const stepArb = fc.constantFrom(WIDER, NARROWER, TALLER, SHORTER);

    await fc.assert(
      fc.property(
        fc.constantFrom<GridColumns>(1, 2, 3, 4),
        fc.record({ w: fc.integer({ min: 1, max: 4 }), h: fc.integer({ min: 1, max: 4 }) }),
        fc.array(stepArb, { maxLength: 12 }),
        (columns, drawn, steps) => {
          const bounds = boundsOnGrid(AT_MOST_TWO, columns);
          const ends = steps
            .map((step) => steppedSize(drawn, step, bounds))
            .filter((size) => size !== undefined);

          for (const size of ends) {
            expect(size.w).toBeGreaterThanOrEqual(bounds.minW);
            expect(size.w).toBeLessThanOrEqual(bounds.maxW);
            expect(size.h).toBeGreaterThanOrEqual(bounds.minH);
            expect(size.h).toBeLessThanOrEqual(bounds.maxH);
          }
        },
      ),
    );
  });
});

describe("resize", () => {
  it("given a block drawn narrower than it is kept, when only its height changes, then its width is kept for a wider screen", () => {
    const wide = draftOf(["x", FOUR_BY_TWO]);

    expect(resize(wide, "x", TWO_BY_TWO, { w: 2, h: 3 })).toEqual(draftOf(["x", { w: 4, h: 3 }]));
    expect(resize(wide, "x", TWO_BY_TWO, { w: 1, h: 2 })).toEqual(draftOf(["x", { w: 1, h: 2 }]));
  });

  it("given a block drawn wider than it is kept, when only its height changes, then its stored width is kept", () => {
    const notes = draftOf(["notes", { w: 1, h: 2 }]);

    expect(resize(notes, "notes", TWO_BY_TWO, { w: 2, h: 3 })).toEqual(
      draftOf(["notes", { w: 1, h: 3 }]),
    );
  });

  it("given the size a block already has, when resized to it, then the draft is unchanged", () => {
    expect(resize(FOUR, "c", TWO_BY_ONE, TWO_BY_ONE)).toBe(FOUR);
    expect(resize(FOUR, "z", TWO_BY_ONE, ONE_BY_ONE)).toBe(FOUR);
  });

  it("given any stored and drawn sizes, when a side is moved, then the stored side never moves against the gesture and the other side keeps its stored value", async () => {
    const side = fc.integer({ min: 1, max: 4 });
    const size = fc.record({ w: side, h: side });

    await fc.assert(
      fc.property(size, size, size, (stored, drawn, target) => {
        const after = resize(draftOf(["x", stored]), "x", drawn, target)[0]?.size;
        if (!after) throw new Error("the block left the draft");

        for (const axis of ["w", "h"] as const) {
          if (target[axis] === drawn[axis]) expect(after[axis]).toBe(stored[axis]);
          if (target[axis] < drawn[axis]) expect(after[axis]).toBeLessThanOrEqual(stored[axis]);
          if (target[axis] > drawn[axis]) expect(after[axis]).toBeGreaterThanOrEqual(stored[axis]);
        }
      }),
    );
  });
});

describe("a step from a tile the grid grew past its size", () => {
  const TONIGHT: BlockSizing = {
    bounds: { minW: 1, maxW: 2, minH: 1, maxH: 3 },
    defaultSize: TWO_BY_ONE,
  };
  const AGENDA: BlockSizing = {
    bounds: { minW: 2, maxW: 4, minH: 2, maxH: 4 },
    defaultSize: FOUR_BY_TWO,
  };
  const sizingOf = (id: string) => (id === "calendar" ? AGENDA : TONIGHT);
  const home = draftOf(["tonight", ONE_BY_ONE], ["calendar", FOUR_BY_TWO]);

  it("given tonight 1x1 grown to the row of 3 columns, when narrowed, then nothing is written and the command is not offered", () => {
    const drawn = drawnSizeIn(home, "tonight", 3, sizingOf);
    if (!drawn) throw new Error("tonight is not drawn");
    const bounds = boundsOnGrid(TONIGHT, 3);

    expect(drawn).toEqual({ w: 3, h: 1 });
    expect(stepSize(home, "tonight", drawn, NARROWER, bounds)).toBe(home);
    expect(steppedStored(ONE_BY_ONE, drawn, NARROWER, bounds)).toBeUndefined();
    expect(steppedStored(ONE_BY_ONE, drawn, TALLER, bounds)).toEqual({ w: 1, h: 2 });
  });
});

describe("hide and show", () => {
  it("given a visible block, when it is hidden, then it leaves the order", () => {
    expect(idsOf(hide(FOUR, "b"))).toEqual(["a", "c", "d"]);
    expect(hide(FOUR, "z")).toBe(FOUR);
  });

  it("given a hidden block, when it is shown, then it comes last at the given size", () => {
    expect(show(FOUR, "z", TWO_BY_ONE).at(-1)).toEqual({ id: "z", size: TWO_BY_ONE });
    expect(show(FOUR, "a", TWO_BY_ONE)).toBe(FOUR);
  });
});

describe("undo", () => {
  it("given recorded drafts, when undone, then the previous draft comes back", () => {
    const moved = moveBy(FOUR, "a", 1);
    const history = record(record({ draft: FOUR, past: [] }, moved), moved);

    expect(undo(history)).toEqual({ draft: FOUR, past: [] });
  });

  it("given no past, when undone, then nothing changes", () => {
    const history = { draft: FOUR, past: [] };

    expect(undo(history)).toBe(history);
  });
});
