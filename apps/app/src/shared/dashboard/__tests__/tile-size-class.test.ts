import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { BlockSize } from "../block-size";
import { keepsControlsStill, TILE_SIZE_CLASSES, tileSizeClass } from "../tile-size-class";

const sideArb = fc.integer({ min: 1, max: 6 });

const sizeArb = fc.record({ w: sideArb, h: sideArb });

const rank = (size: BlockSize) => TILE_SIZE_CLASSES.indexOf(tileSizeClass(size));

describe("a tile writes its content for the room it has", () => {
  it("given the smallest tile, a glance; two or three cases, a few rows; from four cases, the full list", () => {
    expect(tileSizeClass({ w: 1, h: 1 })).toBe("glance");
    expect(tileSizeClass({ w: 2, h: 1 })).toBe("few");
    expect(tileSizeClass({ w: 1, h: 2 })).toBe("few");
    expect(tileSizeClass({ w: 3, h: 1 })).toBe("few");
    expect(tileSizeClass({ w: 1, h: 3 })).toBe("few");
    expect(tileSizeClass({ w: 2, h: 2 })).toBe("full");
    expect(tileSizeClass({ w: 4, h: 1 })).toBe("full");
    expect(tileSizeClass({ w: 4, h: 2 })).toBe("full");
  });

  it("given any tile grown wider or taller, it never shows less than before", () => {
    fc.assert(
      fc.property(sizeArb, sideArb, sideArb, (size, wider, taller) => {
        expect(rank({ w: size.w + wider - 1, h: size.h + taller - 1 })).toBeGreaterThanOrEqual(
          rank(size),
        );
      }),
    );
  });

  it("given two tiles of the same surface, they show the same content", () => {
    fc.assert(
      fc.property(sizeArb, ({ w, h }) => {
        expect(tileSizeClass({ w: h, h: w })).toBe(tileSizeClass({ w, h }));
      }),
    );
  });

  it("given a tile one row high, its controls scroll with its body; from two rows they stay still", () => {
    expect(keepsControlsStill({ w: 4, h: 1 })).toBe(false);
    expect(keepsControlsStill({ w: 1, h: 2 })).toBe(true);
  });
});
