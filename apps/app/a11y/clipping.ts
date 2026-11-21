import type { Locator } from "@playwright/test";

/** A vertical stretch of the viewport, in pixels: where a box is drawn, or what shows it. */
export interface Span {
  top: number;
  bottom: number;
}

/**
 * The spans that clip an element vertically, nearest first: each ancestor that does not let its
 * content overflow, a region that scrolls or a tile that hides what it cannot hold.
 */
export function clippingFrames(target: Locator): Promise<Span[]> {
  return target.evaluate((element) => {
    const frames: { top: number; bottom: number }[] = [];

    for (let node = element.parentElement; node; node = node.parentElement) {
      if (getComputedStyle(node).overflowY === "visible") continue;

      const { top, bottom } = node.getBoundingClientRect();
      frames.push({ top, bottom });
    }

    return frames;
  });
}

/** Whether a box is drawn whole inside a frame, a pixel of rounding let off. */
export function drawnWithin(box: Span, frame: Span): boolean {
  return box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1;
}
