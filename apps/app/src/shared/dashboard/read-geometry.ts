import { type BlockSize, type GridItem, pack, toGrid, unitsFor } from "./dashboard-pack";
import type { LayoutBlock } from "./layout-migration";

export interface ReadGeometry {
  tiles: GridItem[];
  tracks: string | undefined;
}

const ROW_STEP = "var(--dashboard-row-height)";

const FLOWING_ROW = "auto";

/**
 * Where each block of the home lands, in grid columns and row tracks. On a phone a block that
 * flows with the page keeps the two rows of its size as one `auto` track, so it takes the height
 * of its content and nothing else moves: it is alone on its row.
 */
export function readGeometry(
  order: readonly LayoutBlock[],
  cols: number,
  flowing: ReadonlySet<string>,
): ReadGeometry {
  const sizes = new Map(order.map(({ id, size }) => [id, size]));
  const sizeOf = (id: string): BlockSize => sizes.get(id) ?? "m";
  const units = unitsFor(cols);
  const ids = order.map(({ id }) => id);
  const tiles = toGrid(pack(ids, sizeOf, units).items, cols);
  const flow = units === 2 ? tiles.find(({ i }) => flowing.has(i)) : undefined;
  if (!flow) return { tiles, tracks: undefined };

  return withFlowingRow(tiles, flow);
}

function withFlowingRow(tiles: readonly GridItem[], flow: GridItem): ReadGeometry {
  const rows = Math.max(...tiles.map(({ y, h }) => y + h));
  const folded = new Set(Array.from({ length: flow.h - 1 }, (_, step) => flow.y + 1 + step));
  const kept = Array.from({ length: rows }, (_, row) => row).filter((row) => !folded.has(row));
  const trackOf = (row: number) => kept.filter((other) => other < row).length;

  return {
    tiles: tiles.map((tile) => ({
      ...tile,
      y: trackOf(tile.y),
      h: trackOf(tile.y + tile.h) - trackOf(tile.y),
    })),
    tracks: kept.map((row) => (row === flow.y ? FLOWING_ROW : ROW_STEP)).join(" "),
  };
}
