import { describe, expect, it } from "vitest";
import type { BlockSize } from "../dashboard-pack";
import {
  type Draft,
  hide,
  moveBy,
  moveToEdge,
  moveToRow,
  record,
  show,
  stepSize,
  undo,
} from "../layout-commands";

function draftOf(...blocks: [string, BlockSize][]): Draft {
  return blocks.map(([id, size]) => ({ id, size }));
}

function idsOf(draft: Draft): string[] {
  return draft.map((block) => block.id);
}

const FOUR = draftOf(["a", "s"], ["b", "s"], ["c", "m"], ["d", "l"]);

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

describe("moveToRow on 2 units", () => {
  it("given a medium under two smalls, when it goes up, then it takes the place of the small under its centre", () => {
    expect(idsOf(moveToRow(FOUR, "c", "up", 2))).toEqual(["a", "c", "b", "d"]);
  });

  it("given a small on the first row, when it goes down, then it takes the place of the block below", () => {
    expect(idsOf(moveToRow(FOUR, "a", "down", 2))).toEqual(["b", "c", "a", "d"]);
  });

  it("given a block on the first or last row, when it leaves the grid, then the draft is unchanged", () => {
    expect(moveToRow(FOUR, "a", "up", 2)).toBe(FOUR);
    expect(moveToRow(FOUR, "d", "down", 2)).toBe(FOUR);
  });
});

describe("moveToRow on 4 units", () => {
  const WIDE = draftOf(["x", "xl"], ["a", "m"], ["b", "m"], ["c", "l"]);

  it("given a large in the right cell, when it goes up, then it takes the place of the full row above", () => {
    expect(idsOf(moveToRow(WIDE, "c", "up", 4))).toEqual(["c", "x", "a", "b"]);
  });

  it("given a medium in the bottom half of a cell, when it goes up, then it takes the place of the medium above", () => {
    expect(idsOf(moveToRow(WIDE, "b", "up", 4))).toEqual(["x", "b", "a", "c"]);
  });

  it("given a full row, when it goes down, then it takes the place of the block under its centre", () => {
    expect(idsOf(moveToRow(WIDE, "x", "down", 4))).toEqual(["a", "b", "c", "x"]);
  });
});

describe("stepSize", () => {
  it("given a size the block allows next, when it grows, then it takes that size", () => {
    expect(stepSize(FOUR, "c", 1, ["m", "l"])).toEqual(
      draftOf(["a", "s"], ["b", "s"], ["c", "l"], ["d", "l"]),
    );
  });

  it("given a size the block does not allow, when it grows, then it skips to the next allowed one", () => {
    expect(stepSize(FOUR, "c", 1, ["m", "xl"])[2]).toEqual({ id: "c", size: "xl" });
  });

  it("given the largest or smallest allowed size, when it steps past it, then the draft is unchanged", () => {
    expect(stepSize(FOUR, "c", 1, ["s", "m"])).toBe(FOUR);
    expect(stepSize(FOUR, "a", -1, ["s", "m"])).toBe(FOUR);
  });
});

describe("hide and show", () => {
  it("given a visible block, when it is hidden, then it leaves the order", () => {
    expect(idsOf(hide(FOUR, "b"))).toEqual(["a", "c", "d"]);
    expect(hide(FOUR, "z")).toBe(FOUR);
  });

  it("given a hidden block, when it is shown, then it comes last at the given size", () => {
    expect(show(FOUR, "z", "m").at(-1)).toEqual({ id: "z", size: "m" });
    expect(show(FOUR, "a", "m")).toBe(FOUR);
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
