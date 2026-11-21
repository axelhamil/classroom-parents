import type { Layout, LayoutItem } from "react-grid-layout";
import type { LayoutConstraint } from "react-grid-layout/core";
import { type BlockSize, type BlockSizing, boundsOnGrid, heldOnGrid } from "../block-size";
import { type EditSlot, type FlowingTile, type GridMetrics, rowsPerUnit } from "./edit-geometry";

/** Where a resize began: the tile's span on the grid and the rectangle it was drawn in, in cases. */
export interface ResizeStart {
  id: string;
  h: number;
  drawn: BlockSize;
}

const SIDE_HANDLES = ["e", "w"] as const;

/**
 * Snaps a tile being resized to whole cases, the middle of a case tipping it over, and holds it
 * within its block's bounds and the columns of the grid.
 */
export function sizeConstraint(
  sizingOf: (id: string) => BlockSizing | undefined,
  metrics: GridMetrics,
): LayoutConstraint {
  return {
    name: "blockSize",
    constrainSize(item, w, h) {
      const wanted = casesOfSpan(Math.max(w, 1), h, metrics);

      return gridSpanOf(heldOnGrid(wanted, sizingOf(item.i), metrics.cols), metrics);
    },
  };
}

/**
 * The size a handle pulls a tile to, in cases, held within its block's bounds: a tile the grid grew
 * past them to leave no hole never keeps that growth as its own size.
 */
export function resizedSize(
  cases: BlockSize,
  sizing: BlockSizing | undefined,
  metrics: GridMetrics,
): BlockSize {
  return heldOnGrid({ w: cases.w, h: Math.max(cases.h, 1) }, sizing, metrics.cols);
}

/**
 * The size a handle pulls a tile to, from the rectangle it was drawn in when the gesture began: its
 * height moves by the rows the handle travelled, a part of a row under half dropped, so a tile drawn
 * at the height of its content never reads that height as rows.
 */
export function pulledSize(
  start: ResizeStart,
  item: { w: number; h: number },
  sizing: BlockSizing | undefined,
  metrics: GridMetrics,
): BlockSize {
  const rows = Math.round((item.h - start.h) / rowsPerUnit(metrics));

  return resizedSize({ w: item.w, h: start.drawn.h + rows }, sizing, metrics);
}

/**
 * Each tile told its bounds, so the library stops a handle where the block can go no further. The
 * tile drawn at the height of its content keeps it: only the handles of a side it may change.
 */
export function boundedLayout(
  slots: readonly EditSlot[],
  sizingOf: (id: string) => BlockSizing | undefined,
  metrics: GridMetrics,
  flow: FlowingTile | undefined,
): Layout {
  return slots.map(({ item }) => {
    const sizing = sizingOf(item.i);
    if (!sizing) return item;

    const { minW, maxW, minH, maxH } = boundsOnGrid(sizing, metrics.cols);
    const least = gridSpanOf({ w: minW, h: minH }, metrics);
    const most = gridSpanOf({ w: maxW, h: maxH }, metrics);
    const bounded = { ...item, minW: least.w, minH: least.h, maxW: most.w, maxH: most.h };
    if (item.i !== flow?.id) return bounded;

    return { ...bounded, minH: item.h, maxH: item.h, ...sideHandles(minW < maxW) };
  });
}

/** The handles of a tile whose height is held: its sides when its width may change, none otherwise. */
function sideHandles(widthMoves: boolean): Partial<LayoutItem> {
  return widthMoves ? { resizeHandles: [...SIDE_HANDLES] } : { isResizable: false };
}

/** A span of the grid as the size in cases it stands for, a part of a row rounded to the nearest. */
export function casesOfSpan(w: number, h: number, metrics: GridMetrics): BlockSize {
  return { w, h: Math.max(Math.round(h / rowsPerUnit(metrics)), 1) };
}

/** A size in cases as the span of the grid that draws it. */
export function gridSpanOf(size: BlockSize, metrics: GridMetrics): BlockSize {
  return { w: size.w, h: size.h * rowsPerUnit(metrics) };
}
