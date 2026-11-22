import type { Layout } from "react-grid-layout";
import type { BlockSize, GridColumns } from "../block-size";
import { type GridItem, type Placed, pack, toGrid } from "../dashboard-pack";

export interface GridMetrics {
  cols: GridColumns;
  rowHeight: number;
  gap: number;
}

export interface EditGridConfig {
  cols: number;
  rowHeight: number;
  margin: readonly [number, number];
  containerPadding: readonly [number, number];
  tileGap: number;
}

/** The tile drawn at the height of its content on a phone, and that height in pixels, measured as read. */
export interface FlowingTile {
  id: string;
  px: number;
}

export interface EditSlot {
  item: GridItem;
  units: { w: number; h: number };
}

const PIXEL_ROW = 1;

export function hasPixelRows({ cols }: GridMetrics): boolean {
  return cols === 1;
}

export function rowsPerUnit(metrics: GridMetrics): number {
  if (!hasPixelRows(metrics)) return 1;

  return metrics.rowHeight + metrics.gap;
}

export function editGridConfig(metrics: GridMetrics): EditGridConfig {
  const { cols, rowHeight, gap } = metrics;

  if (hasPixelRows(metrics))
    return {
      cols,
      rowHeight: PIXEL_ROW,
      margin: [gap, 0],
      containerPadding: [0, 0],
      tileGap: gap,
    };

  return { cols, rowHeight, margin: [gap, gap], containerPadding: [0, 0], tileGap: 0 };
}

export function editGeometry(
  order: readonly string[],
  sizeOf: (id: string) => BlockSize,
  metrics: GridMetrics,
  flow?: FlowingTile,
): Layout {
  return editSlots(order, sizeOf, metrics, flow).map(({ item }) => item);
}

export function editSlots(
  order: readonly string[],
  sizeOf: (id: string) => BlockSize,
  metrics: GridMetrics,
  flow?: FlowingTile,
): EditSlot[] {
  const packed = pack(
    order.map((id) => ({ id, size: sizeOf(id) })),
    metrics.cols,
  );
  const items = toGrid(packed);
  const placed = hasPixelRows(metrics) ? toPixelRows(packed, items, metrics, flow) : items;

  return placed.map((item, index) => ({ item, units: unitSpanOf(packed[index]) }));
}

function unitSpanOf(packed: Placed | undefined): EditSlot["units"] {
  return { w: packed?.w ?? 1, h: packed?.h ?? 1 };
}

function toPixelRows(
  packed: readonly Placed[],
  items: readonly GridItem[],
  metrics: GridMetrics,
  flow: FlowingTile | undefined,
): GridItem[] {
  const tops = rowTops(rowHeights(packed, metrics, flow));
  const topOf = (row: number) => tops[row] ?? 0;

  return items.map((item) => ({
    ...item,
    y: topOf(item.y),
    h: topOf(item.y + item.h) - topOf(item.y),
  }));
}

function rowHeights(
  packed: readonly Placed[],
  metrics: GridMetrics,
  flow: FlowingTile | undefined,
): number[] {
  const rows = Math.max(0, ...packed.map(({ y, h }) => y + h));
  const heights = Array.from({ length: rows }, () => rowsPerUnit(metrics));
  const flowing = packed.find(({ id }) => id === flow?.id);
  if (!flowing || !flow) return heights;

  heights.fill(0, flowing.y, flowing.y + flowing.h);
  heights[flowing.y] = flow.px + metrics.gap;

  return heights;
}

function rowTops(heights: readonly number[]): number[] {
  const tops = [0];

  for (const height of heights) tops.push((tops.at(-1) ?? 0) + height);

  return tops;
}
