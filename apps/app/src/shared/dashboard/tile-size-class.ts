import type { BlockSize } from "./block-size";
import { useTileFrame } from "./tile-frame";

/**
 * What a block writes in its tile, from the room it has: a glance (a figure and the nearest item),
 * a few rows, or the full list.
 */
export const TILE_SIZE_CLASSES = ["glance", "few", "full"] as const;

export type TileSizeClass = (typeof TILE_SIZE_CLASSES)[number];

/** The largest surface, in cases, that only holds a glance: one card column by one row. */
const GLANCE_MAX_CASES = 1;

/** The largest surface, in cases, that holds a few rows; from the next one a tile lists everything. */
const FEW_MAX_CASES = 3;

/** The fewest rows under which a block keeps its controls still while its list scrolls. */
const STILL_CONTROLS_MIN_ROWS = 2;

/**
 * The content a tile of this size holds, read from its surface in cases alone, so that growing a
 * tile in either direction never shows less, and a tile turned on its side shows the same.
 */
export function tileSizeClass({ w, h }: BlockSize): TileSizeClass {
  const cases = w * h;
  if (cases <= GLANCE_MAX_CASES) return "glance";

  return cases <= FEW_MAX_CASES ? "few" : "full";
}

/**
 * Whether a tile is high enough to keep a block's controls still above the part that scrolls: one
 * row high, only a slit would scroll under them, so the whole body scrolls instead and opens on
 * the controls rather than on the item the block jumps to.
 */
export function keepsControlsStill({ h }: BlockSize): boolean {
  return h >= STILL_CONTROLS_MIN_ROWS;
}

/** The content the tile around the calling block holds, read from its real size on the grid. */
export function useTileSizeClass(): TileSizeClass {
  return tileSizeClass(useTileFrame().size);
}
