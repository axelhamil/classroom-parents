import type { Layout } from "react-grid-layout";
import {
  type BlockSize,
  type GridItem,
  type PackedItem,
  pack,
  toGrid,
  unitsFor,
} from "../dashboard-pack";

export const AGENDA_BLOCK_ID = "calendar";

export interface GridMetrics {
  cols: number;
  rowHeight: number;
  gap: number;
}

/** Whether a block takes one more row at this width, the same answer read and edit both ask. */
export type TallOf = (id: string) => boolean;

export interface EditGridConfig {
  cols: number;
  rowHeight: number;
  margin: readonly [number, number];
  containerPadding: readonly [number, number];
  tileGap: number;
}

export interface EditSlot {
  item: GridItem;
  units: { w: number; h: number };
}

const PIXEL_ROW = 1;

export function hasPixelRows({ cols }: GridMetrics): boolean {
  return unitsFor(cols) === 2;
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
  agendaPx?: number,
  tallOf?: TallOf,
): Layout {
  return editSlots(order, sizeOf, metrics, agendaPx, tallOf).map(({ item }) => item);
}

export function editSlots(
  order: readonly string[],
  sizeOf: (id: string) => BlockSize,
  metrics: GridMetrics,
  agendaPx?: number,
  tallOf?: TallOf,
): EditSlot[] {
  const packed = pack(order, sizeOf, unitsFor(metrics.cols), tallOf).items;
  const items = toGrid(packed, metrics.cols);
  const placed = hasPixelRows(metrics) ? toPixelRows(packed, items, metrics, agendaPx) : items;

  return placed.map((item, index) => ({ item, units: unitSpanOf(packed[index]) }));
}

function unitSpanOf(packed: PackedItem | undefined): EditSlot["units"] {
  return { w: packed?.w ?? 1, h: packed?.h ?? 1 };
}

function toPixelRows(
  packed: readonly PackedItem[],
  items: readonly GridItem[],
  metrics: GridMetrics,
  agendaPx: number | undefined,
): GridItem[] {
  const tops = rowTops(rowHeights(packed, metrics, agendaPx));
  const topOf = (row: number) => tops[row] ?? 0;

  return items.map((item) => ({
    ...item,
    y: topOf(item.y),
    h: topOf(item.y + item.h) - topOf(item.y),
  }));
}

function rowHeights(
  packed: readonly PackedItem[],
  metrics: GridMetrics,
  agendaPx: number | undefined,
): number[] {
  const rows = Math.max(0, ...packed.map(({ y, h }) => y + h));
  const heights = Array.from({ length: rows }, () => rowsPerUnit(metrics));
  const agenda = packed.find(({ id }) => id === AGENDA_BLOCK_ID);
  if (!agenda || agendaPx === undefined) return heights;

  heights.fill(0, agenda.y, agenda.y + agenda.h);
  heights[agenda.y] = agendaPx + metrics.gap;

  return heights;
}

function rowTops(heights: readonly number[]): number[] {
  const tops = [0];

  for (const height of heights) tops.push((tops.at(-1) ?? 0) + height);

  return tops;
}
