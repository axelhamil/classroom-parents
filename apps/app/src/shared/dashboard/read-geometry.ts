import { type BlockSize, type BlockSizing, type GridColumns, sizeAt } from "./block-size";
import { type GridItem, type Placed, pack, toGrid } from "./dashboard-pack";
import type { LayoutBlock } from "./layout-migration";

export interface ReadGeometry {
  tiles: GridItem[];
  tracks: string | undefined;
  sizes: ReadonlyMap<string, BlockSize>;
}

const ROW_STEP = "var(--dashboard-row-height)";

const FLOWING_ROW = "auto";

/**
 * Where each block of the home lands, in columns of cards and row tracks, each block held within
 * its bounds at this width. On a phone a block that flows with the page keeps the rows of its size
 * as one `auto` track, so it takes the height of its content and nothing else moves: it is alone
 * on its row. `sizes` is the rectangle each block is packed in, the room its content is written for,
 * a flowing block keeping the rows of its size.
 */
export function readGeometry(
  order: readonly LayoutBlock[],
  columns: GridColumns,
  flowing: ReadonlySet<string>,
  sizingOf: (id: string) => BlockSizing | undefined = () => undefined,
): ReadGeometry {
  const tiles = toGrid(packedAt(order, columns, sizingOf));
  const sizes = new Map(tiles.map(({ i, w, h }) => [i, { w, h }]));
  const flow = columns === 1 ? tiles.find(({ i }) => flowing.has(i)) : undefined;
  if (!flow) return { tiles, tracks: undefined, sizes };

  return { ...withFlowingRow(tiles, flow), sizes };
}

/**
 * The rectangle a block is drawn in, in cases: its size held within its bounds and the columns,
 * grown where the grid closes a hole with it. What its size controls start from.
 */
export function drawnSizeIn(
  order: readonly LayoutBlock[],
  id: string,
  columns: GridColumns,
  sizingOf: (id: string) => BlockSizing | undefined = () => undefined,
): BlockSize | undefined {
  const placed = packedAt(order, columns, sizingOf).find((item) => item.id === id);

  return placed && { w: placed.w, h: placed.h };
}

/**
 * The blocks packed in the rectangles they are drawn in at this column count, each held within its
 * bounds there: what the reader sees, and what a move by rows reads.
 */
export function packedAt(
  order: readonly LayoutBlock[],
  columns: GridColumns,
  sizingOf: (id: string) => BlockSizing | undefined,
): Placed[] {
  const entries = order.map(({ id, size }) => ({ id, size: sizeAt(size, sizingOf(id), columns) }));

  return pack(entries, columns);
}

function withFlowingRow(tiles: readonly GridItem[], flow: GridItem): Omit<ReadGeometry, "sizes"> {
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
