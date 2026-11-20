import { describe, expect, it } from "vitest";
import type { BlockSize } from "../dashboard-pack";
import { readStoredLayout, snapSize } from "../layout-migration";

describe("a stored layout is read in either version", () => {
  it("given a v1 layout, then hidden blocks leave and each width gives its size", () => {
    const v1 = [
      { id: "today", w: 3, h: 1, hidden: false },
      { id: "tonight", w: 4, h: 2, hidden: false },
      { id: "notes", w: 4, h: 1, hidden: true },
      { id: "review", w: 6, h: 1, hidden: false },
      { id: "overdue", w: 8, h: 3, hidden: false },
      { id: "calendar", w: 12, h: 2, hidden: false },
    ];

    expect(readStoredLayout(v1)).toEqual([
      { id: "today", size: "s" },
      { id: "tonight", size: "m" },
      { id: "review", size: "l" },
      { id: "overdue", size: "l" },
      { id: "calendar", size: "xl" },
    ]);
  });

  it("given a v2 layout, then its order and sizes are kept as stored", () => {
    const v2 = {
      v: 2,
      blocks: [
        { id: "calendar", size: "xl" },
        { id: "notes", size: "m" },
      ],
    };

    expect(readStoredLayout(v2)).toEqual(v2.blocks);
  });

  it.each([null, undefined, { v: 3, blocks: [] }, [{ id: "today", w: 5, h: 1, hidden: false }]])(
    "given %j, then nothing usable is stored",
    (stored) => {
      expect(readStoredLayout(stored)).toBeNull();
    },
  );
});

describe("a size snaps to the closest one the block allows", () => {
  it.each<[BlockSize, BlockSize[], BlockSize]>([
    ["s", ["m", "l", "xl"], "m"],
    ["xl", ["s", "m"], "m"],
    ["m", ["s", "l"], "l"],
    ["l", ["m", "l"], "l"],
  ])("given %s among %j, then it becomes %s", (size, allowed, snapped) => {
    expect(snapSize(size, allowed)).toBe(snapped);
  });
});
