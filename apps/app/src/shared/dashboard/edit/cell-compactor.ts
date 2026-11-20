import type { RefObject } from "react";
import type { Compactor, Layout, LayoutItem } from "react-grid-layout";
import type { BlockSize, GridItem } from "../dashboard-pack";
import { type EditSlot, editGeometry, editSlots, type GridMetrics } from "./edit-geometry";

export interface CellCompactorRefs {
  order: RefObject<readonly string[]>;
  active: RefObject<string | null>;
  metrics: RefObject<GridMetrics>;
  agendaPx: RefObject<number | undefined>;
  sizeOf: RefObject<(id: string) => BlockSize>;
  onIndexChange: RefObject<(id: string, index: number) => void>;
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

export function createCellCompactor(refs: CellCompactorRefs): CellCompactor {
  let drag: Drag | null = null;

  const geometryOf = (order: readonly string[]) =>
    editGeometry(order, refs.sizeOf.current, refs.metrics.current, refs.agendaPx.current);

  const slotsOf = (order: readonly string[]) =>
    editSlots(order, refs.sizeOf.current, refs.metrics.current, refs.agendaPx.current);

  const follow = (dragged: LayoutItem, current: Drag): Drag => {
    const order = current.order;
    const from = order.indexOf(dragged.i);
    const to = targetIndex(order, slotsOf(order), dragged);
    if (to === from) return current;

    refs.onIndexChange.current(dragged.i, to);

    return { id: current.id, order: moved(order, dragged.i, to) };
  };

  return {
    type: "cells",
    allowOverlap: false,
    compact(layout: Layout): Layout {
      const active = refs.active.current;
      if (active === null) {
        drag = null;
        return geometryOf(refs.order.current);
      }

      const current = drag?.id === active ? drag : { id: active, order: refs.order.current };
      const dragged = layout.find(({ i }) => i === active);
      drag = dragged ? follow(dragged, current) : current;

      return geometryOf(drag.order);
    },
    currentOrder: () => drag?.order ?? refs.order.current,
  };
}

function targetIndex(order: readonly string[], slots: readonly EditSlot[], dragged: LayoutItem) {
  const from = order.indexOf(dragged.i);
  const own = slots.find(({ item }) => item.i === dragged.i)?.item;
  if (!own) return from;

  const center = centerOf(dragged);
  const hit = slots.find(({ item }) => item.i !== dragged.i && contains(item, center));
  if (!hit || !crossedMiddle(center, own, unitAt(hit, center))) return from;

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
