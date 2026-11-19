import { describe, expect, it } from "vitest";
import {
  type BlockSizes,
  type HomeBlock,
  moveBlock,
  normalizeLayout,
  resizeBlock,
  showBlock,
} from "../dashboard-layout";

const WIDE: BlockSizes = { w: [4, 6, 8], h: [1, 2] };
const SMALL: BlockSizes = { w: [3, 4], h: [1] };

const REGISTRY = [
  { id: "today", sizes: WIDE, defaultSize: { w: 4, h: 2 } },
  { id: "notes", sizes: SMALL, defaultSize: { w: 3, h: 1 } },
  { id: "week", sizes: WIDE, defaultSize: { w: 8, h: 2 } },
] as const;

const DEFAULTS: HomeBlock[] = [
  { id: "today", w: 4, h: 2, hidden: false },
  { id: "week", w: 8, h: 2, hidden: false },
  { id: "notes", w: 3, h: 1, hidden: true },
];

describe("a stored home layout is normalized against the blocks that exist", () => {
  it("given no stored layout, then the default layout is shown", () => {
    expect(normalizeLayout(null, REGISTRY, DEFAULTS)).toEqual(DEFAULTS);
  });

  it("given a block that no longer exists, then it is dropped silently", () => {
    const stored: HomeBlock[] = [
      { id: "gone", w: 4, h: 1, hidden: false },
      { id: "week", w: 8, h: 2, hidden: false },
      { id: "today", w: 4, h: 2, hidden: false },
      { id: "notes", w: 3, h: 1, hidden: false },
    ];

    expect(normalizeLayout(stored, REGISTRY, DEFAULTS).map((block) => block.id)).toEqual([
      "week",
      "today",
      "notes",
    ]);
  });

  it("given a size between two allowed steps, then it snaps to the nearest one", () => {
    const stored: HomeBlock[] = [
      { id: "today", w: 12, h: 3, hidden: false },
      { id: "notes", w: 8, h: 2, hidden: false },
      { id: "week", w: 3, h: 1, hidden: false },
    ];

    expect(normalizeLayout(stored, REGISTRY, DEFAULTS)).toEqual([
      { id: "today", w: 8, h: 2, hidden: false },
      { id: "notes", w: 4, h: 1, hidden: false },
      { id: "week", w: 4, h: 1, hidden: false },
    ]);
  });

  it("given a block of the registry the layout does not know yet, then it is appended hidden", () => {
    const stored: HomeBlock[] = [{ id: "week", w: 6, h: 1, hidden: false }];

    expect(normalizeLayout(stored, REGISTRY, DEFAULTS)).toEqual([
      { id: "week", w: 6, h: 1, hidden: false },
      { id: "today", w: 4, h: 2, hidden: true },
      { id: "notes", w: 3, h: 1, hidden: true },
    ]);
  });

  it("given the same block twice, then only its first place is kept", () => {
    const stored: HomeBlock[] = [
      { id: "notes", w: 4, h: 1, hidden: false },
      { id: "today", w: 4, h: 2, hidden: false },
      { id: "notes", w: 3, h: 1, hidden: true },
      { id: "week", w: 8, h: 2, hidden: false },
    ];

    expect(normalizeLayout(stored, REGISTRY, DEFAULTS)).toEqual([
      { id: "notes", w: 4, h: 1, hidden: false },
      { id: "today", w: 4, h: 2, hidden: false },
      { id: "week", w: 8, h: 2, hidden: false },
    ]);
  });
});

describe("a block is resized one allowed step at a time", () => {
  const today: HomeBlock = { id: "today", w: 4, h: 2, hidden: false };

  it("widening goes to the next allowed width", () => {
    expect(resizeBlock(today, WIDE, "w", 1)).toEqual({ ...today, w: 6 });
  });

  it("at the widest allowed step, widening changes nothing", () => {
    expect(resizeBlock({ ...today, w: 8 }, WIDE, "w", 1)).toBeNull();
  });

  it("at the shortest allowed step, lowering changes nothing", () => {
    expect(resizeBlock({ ...today, h: 1 }, WIDE, "h", -1)).toBeNull();
  });

  it("taller goes to the next allowed height", () => {
    expect(resizeBlock({ ...today, h: 1 }, WIDE, "h", 1)).toEqual({ ...today, h: 2 });
  });
});

describe("visible blocks are moved among themselves", () => {
  const layout: HomeBlock[] = [
    { id: "today", w: 4, h: 2, hidden: false },
    { id: "notes", w: 3, h: 1, hidden: true },
    { id: "week", w: 8, h: 2, hidden: false },
  ];

  it("moving down skips the hidden blocks in between", () => {
    expect(moveBlock(layout, "today", 1).map((block) => block.id)).toEqual([
      "notes",
      "week",
      "today",
    ]);
  });

  it("the first visible block cannot move up", () => {
    expect(moveBlock(layout, "today", -1)).toBe(layout);
  });

  it("a block shown again from the drawer lands after the visible ones", () => {
    expect(showBlock(layout, "notes")).toEqual([
      { id: "today", w: 4, h: 2, hidden: false },
      { id: "week", w: 8, h: 2, hidden: false },
      { id: "notes", w: 3, h: 1, hidden: false },
    ]);
  });
});
