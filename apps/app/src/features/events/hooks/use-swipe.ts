import type { PointerEvent } from "react";
import { useRef } from "react";

const SWIPE_MIN_PX = 60;
const FLICK_PX_PER_MS = 0.4;
const DRAG_FROM_PX = 8;
const FOLLOW_RATIO = 0.5;

export type SwipeStep = 1 | -1;

interface Gesture {
  x: number;
  y: number;
  at: number;
  dragging: boolean;
}

function release(element: HTMLElement): void {
  delete element.dataset.dragging;
  element.style.removeProperty("translate");
}

function isFlick(dx: number, elapsedMs: number): boolean {
  return Math.abs(dx) / Math.max(elapsedMs, 1) > FLICK_PX_PER_MS;
}

export function useSwipe(onSwipe: (step: SwipeStep) => void) {
  const gesture = useRef<Gesture | null>(null);

  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      gesture.current =
        event.pointerType === "mouse"
          ? null
          : { x: event.clientX, y: event.clientY, at: event.timeStamp, dragging: false };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const from = gesture.current;
      if (!from) return;

      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (!from.dragging && (Math.abs(dx) < DRAG_FROM_PX || Math.abs(dx) <= Math.abs(dy))) return;

      from.dragging = true;
      event.currentTarget.dataset.dragging = "";
      event.currentTarget.style.translate = `${dx * FOLLOW_RATIO}px 0`;
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const from = gesture.current;
      gesture.current = null;
      release(event.currentTarget);
      if (!from) return;

      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      const far =
        Math.abs(dx) >= SWIPE_MIN_PX || (from.dragging && isFlick(dx, event.timeStamp - from.at));
      if (!far || Math.abs(dx) <= Math.abs(dy)) return;

      onSwipe(dx < 0 ? 1 : -1);
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      gesture.current = null;
      release(event.currentTarget);
    },
  };
}
