import type { PointerEvent } from "react";
import { useRef } from "react";

const SWIPE_MIN_PX = 60;

export type SwipeStep = 1 | -1;

export function useSwipe(onSwipe: (step: SwipeStep) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onPointerDown: (event: PointerEvent) => {
      start.current = event.pointerType === "mouse" ? null : { x: event.clientX, y: event.clientY };
    },
    onPointerUp: (event: PointerEvent) => {
      const from = start.current;
      start.current = null;
      if (!from) return;

      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return;

      onSwipe(dx < 0 ? 1 : -1);
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
}
