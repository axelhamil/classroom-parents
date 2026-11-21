import type { RefObject } from "react";
import type { Compactor, Layout, LayoutItem } from "react-grid-layout";
import type { BlockSize, GridItem } from "../dashboard-pack";
import { keepPinned } from "../layout-commands";
import {
  type EditSlot,
  editGeometry,
  editSlots,
  type GridMetrics,
  type TallOf,
} from "./edit-geometry";

export interface CellCompactorRefs {
  order: RefObject<readonly string[]>;
  active: RefObject<string | null>;
  metrics: RefObject<GridMetrics>;
  agendaPx: RefObject<number | undefined>;
  sizeOf: RefObject<(id: string) => BlockSize>;
  tallOf: RefObject<TallOf>;
  onIndexChange: RefObject<(id: string, index: number) => void>;
  /** Blocks that stay where they stand: never dragged, never resized, never displaced by a drop. */
  pinned: RefObject<readonly string[]>;
}

export interface CellCompactor extends Compactor {
  currentOrder(): readonly string[];
}

interface Drag {
  id: string;
  order: readonly string[];
}

interface Point {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Placed {
  order: readonly string[];
  sizes: string;
  metrics: GridMetrics;
  agendaPx: number | undefined;
  geometry: Layout;
  slots: readonly EditSlot[];
}

export function createCellCompactor(refs: CellCompactorRefs): CellCompactor {
  let drag: Drag | null = null;
  let placed: Placed | null = null;

  const geometryOf = (order: readonly string[]) =>
    editGeometry(
      order,
      refs.sizeOf.current,
      refs.metrics.current,
      refs.agendaPx.current,
      refs.tallOf.current,
    );

  const placedFor = (order: readonly string[]): Placed => {
    const sizeOf = refs.sizeOf.current;
    const metrics = refs.metrics.current;
    const agendaPx = refs.agendaPx.current;
    const tallOf = refs.tallOf.current;
    const sizes = order.map(sizeOf).join();
    const same =
      placed?.order === order &&
      placed.sizes === sizes &&
      placed.metrics === metrics &&
      placed.agendaPx === agendaPx;
    if (placed && same) return placed;

    placed = {
      order,
      sizes,
      metrics,
      agendaPx,
      geometry: editGeometry(order, sizeOf, metrics, agendaPx, tallOf),
      slots: editSlots(order, sizeOf, metrics, agendaPx, tallOf),
    };

    return placed;
  };

  const follow = (dragged: LayoutItem, current: Drag): Drag => {
    const order = current.order;
    const from = order.indexOf(dragged.i);
    const pinned = refs.pinned.current;
    const to = targetIndex(order, placedFor(order).slots, dragged, pinned);
    if (to === from) return current;

    const next = keepPinned(order, moved(order, dragged.i, to), pinned);
    const index = next.indexOf(dragged.i);
    if (index === from) return current;

    refs.onIndexChange.current(dragged.i, index);

    return { id: current.id, order: next };
  };

  return {
    type: "cells",
    allowOverlap: false,
    compact(layout: Layout): Layout {
      const active = refs.active.current;
      if (active === null) {
        drag = null;
        placed = null;
        return heldStill(geometryOf(refs.order.current), refs.pinned.current);
      }

      const current = drag?.id === active ? drag : { id: active, order: refs.order.current };
      const dragged = layout.find(({ i }) => i === active);
      drag = dragged ? follow(dragged, current) : current;

      return heldStill(placedFor(drag.order).geometry, refs.pinned.current);
    },
    currentOrder: () => drag?.order ?? refs.order.current,
  };
}

/** The layout with each pinned tile neither draggable nor resizable, every item a fresh copy. */
export function heldStill(layout: Layout, pinned: readonly string[]): Layout {
  return layout.map((item) =>
    pinned.includes(item.i) ? { ...item, isDraggable: false, isResizable: false } : { ...item },
  );
}

function targetIndex(
  order: readonly string[],
  slots: readonly EditSlot[],
  dragged: LayoutItem,
  pinned: readonly string[],
) {
  const from = order.indexOf(dragged.i);
  const own = slots.find(({ item }) => item.i === dragged.i)?.item;
  if (!own) return from;

  const center = centerOf(dragged);
  const hit = slots.find(({ item }) => item.i !== dragged.i && contains(item, center));
  if (!hit || pinned.includes(hit.item.i)) return from;
  if (!crossedMiddle(center, own, unitAt(hit, center))) return from;

  return order.indexOf(hit.item.i);
}

function centerOf({ x, y, w, h }: Rect): Point {
  return { x: x + w / 2, y: y + h / 2 };
}

function contains(rect: Rect, { x, y }: Point): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

function unitAt({ item, units }: EditSlot, center: Point): Rect {
  const w = item.w / units.w;
  const h = item.h / units.h;

  return {
    x: item.x + Math.floor((center.x - item.x) / w) * w,
    y: item.y + Math.floor((center.y - item.y) / h) * h,
    w,
    h,
  };
}

function crossedMiddle(center: Point, own: GridItem, unit: Rect): boolean {
  const middle = centerOf(unit);
  const pastRight = unit.x < own.x + own.w || center.x >= middle.x;
  const pastLeft = unit.x + unit.w > own.x || center.x <= middle.x;
  const pastDown = unit.y < own.y + own.h || center.y >= middle.y;
  const pastUp = unit.y + unit.h > own.y || center.y <= middle.y;

  return pastRight && pastLeft && pastDown && pastUp;
}

function moved(order: readonly string[], id: string, to: number): string[] {
  const rest = order.filter((other) => other !== id);

  return [...rest.slice(0, to), id, ...rest.slice(to)];
}
