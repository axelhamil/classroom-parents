import { describe, expect, it } from "vitest";
import { readStoredLayout, storedLayoutOf } from "../layout-migration";

describe("a stored layout is read in cases only", () => {
  it("given a layout in cases, then its order and sizes are kept as stored", () => {
    const stored = {
      v: 3,
      blocks: [
        { id: "calendar", w: 4, h: 3 },
        { id: "notes", w: 1, h: 2 },
      ],
    };

    expect(readStoredLayout(stored)).toEqual([
      { id: "calendar", size: { w: 4, h: 3 } },
      { id: "notes", size: { w: 1, h: 2 } },
    ]);
  });

  it.each([
    ["the advised layout", { v: 3, blocks: null }],
    ["nothing", null],
    ["a layout in fixed sizes", { v: 2, blocks: [{ id: "calendar", size: "xl" }] }],
    ["a layout in the first format", [{ id: "today", w: 3, h: 1, hidden: false }]],
    ["a block in part of a case", { v: 3, blocks: [{ id: "today", w: 1.5, h: 1 }] }],
  ])("given %s, then the advised layout applies", (_, stored) => {
    expect(readStoredLayout(stored)).toBeNull();
  });

  it("given blocks in cases, then they are kept in the form they are read from", () => {
    const blocks = [{ id: "today", size: { w: 2, h: 3 } }];

    expect(readStoredLayout(storedLayoutOf(blocks))).toEqual(blocks);
    expect(storedLayoutOf(null)).toEqual({ v: 3, blocks: null });
  });
});
