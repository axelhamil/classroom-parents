import type { LayoutConstraint } from "react-grid-layout/core";
import { BLOCK_SIZES, type BlockSize, unitsFor } from "../dashboard-pack";
import { type GridMetrics, rowsPerUnit } from "./edit-geometry";

interface Span {
  w: number;
  h: number;
}

const UNIT_SPANS: Record<BlockSize, Span> = {
  s: { w: 1, h: 1 },
  m: { w: 2, h: 1 },
  l: { w: 2, h: 2 },
  xl: { w: 4, h: 2 },
};

export function sizeConstraint(
  allowedOf: (id: string) => readonly BlockSize[],
  metrics: GridMetrics,
): LayoutConstraint {
  return {
    name: "blockSize",
    constrainSize(item, w, h) {
      const size = nearestSize(allowedOf(item.i), w, h, metrics);

      return size ? gridSpanOf(size, metrics) : { w: item.w, h: item.h };
    },
  };
}

export function sizeOfSpan(w: number, h: number, metrics: GridMetrics): BlockSize {
  return nearestSize(BLOCK_SIZES, w, h, metrics) ?? "s";
}

function nearestSize(
  allowed: readonly BlockSize[],
  w: number,
  h: number,
  metrics: GridMetrics,
): BlockSize | undefined {
  const proposed = { w: w / columnsPerUnit(metrics), h: h / rowsPerUnit(metrics) };
  const candidates = BLOCK_SIZES.filter(
    (size) => allowed.includes(size) && fitsWidth(size, metrics),
  );

  return candidates.reduce<BlockSize | undefined>(
    (best, size) => (best && distance(proposed, best) < distance(proposed, size) ? best : size),
    undefined,
  );
}

function gridSpanOf(size: BlockSize, metrics: GridMetrics): Span {
  const span = UNIT_SPANS[size];

  return { w: span.w * columnsPerUnit(metrics), h: span.h * rowsPerUnit(metrics) };
}

function fitsWidth(size: BlockSize, metrics: GridMetrics): boolean {
  return UNIT_SPANS[size].w <= unitsFor(metrics.cols);
}

function distance(proposed: Span, size: BlockSize): number {
  const span = UNIT_SPANS[size];

  return (proposed.w - span.w) ** 2 + (proposed.h - span.h) ** 2;
}

function columnsPerUnit({ cols }: GridMetrics): number {
  return cols / unitsFor(cols);
}
