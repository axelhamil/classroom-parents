import type { Locator } from "@playwright/test";

/**
 * What a reader sees of a region: one rectangle per painted element (a fill, a border, a field,
 * an image or an icon) and per run of text, in viewport pixels. A box that paints nothing (a
 * layout wrapper, a full width `<main>`) is left out, so the rectangles say where content is,
 * not where containers stretch.
 */
export interface PaintedRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The painted rectangles inside `scope`, sr-only text and collapsed boxes excluded. */
export function paintedRects(scope: Locator): Promise<PaintedRect[]> {
  return scope.evaluate((root) => {
    const rects: PaintedRect[] = [];
    const keep = (rect: DOMRect) => {
      if (rect.width < 2 || rect.height < 2) return;

      rects.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
    };
    const visible = (style: CSSStyleDeclaration) =>
      style.visibility !== "hidden" && Number.parseFloat(style.opacity) > 0;
    const seen = (color: string) => !/^rgba\(.*, 0\)$|^transparent$/.test(color);

    for (const element of root.querySelectorAll("*")) {
      const style = getComputedStyle(element);
      if (!visible(style)) continue;

      const painted =
        seen(style.backgroundColor) ||
        (Number.parseFloat(style.borderTopWidth) > 0 && seen(style.borderTopColor)) ||
        ["IMG", "svg", "INPUT", "TEXTAREA", "SELECT", "CANVAS"].includes(element.tagName);
      if (painted) keep(element.getBoundingClientRect());
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!node.textContent?.trim() || !parent || !visible(getComputedStyle(parent))) continue;

      const range = document.createRange();
      range.selectNodeContents(node);
      keep(range.getBoundingClientRect());
    }

    return rects;
  });
}

/**
 * The share of the screen's width left empty beside what is painted: 0 when content runs from
 * one edge to the other, a content wider than the screen (a scrolling table) counts as full.
 */
export function paintedEmptyShare(rects: readonly PaintedRect[], screenWidth: number): number {
  if (rects.length === 0) return 1;

  const left = Math.max(0, Math.min(...rects.map((rect) => rect.left)));
  const right = Math.min(screenWidth, Math.max(...rects.map((rect) => rect.right)));

  return 1 - (right - left) / screenWidth;
}

/** A column of a CSS grid, in viewport pixels. */
export interface GridColumn {
  left: number;
  right: number;
}

/** The columns a grid lays out, read from the pixel widths of its resolved tracks, line names skipped, and its column gap. */
export function gridColumns(grid: Locator): Promise<GridColumn[]> {
  return grid.evaluate((element) => {
    const style = getComputedStyle(element);
    const gap = Number.parseFloat(style.columnGap) || 0;
    const tracks = (style.gridTemplateColumns.match(/-?[\d.]+px/g) ?? []).map(Number.parseFloat);
    let left = element.getBoundingClientRect().left + Number.parseFloat(style.paddingLeft);

    return tracks.map((width) => {
      const column = { left, right: left + width };
      left += width + gap;

      return column;
    });
  });
}

/**
 * The tallest empty stretch between two painted things stacked in the same grid column: a block
 * shorter than its row neighbour leaves this hole under it. Everything painted across a column
 * counts, so a short line of text is not a hole; the space under the last block is not one either.
 */
export function largestHole(rects: readonly PaintedRect[], columns: readonly GridColumn[]): number {
  let largest = 0;

  for (const band of columns) {
    const stacked = rects
      .filter((rect) => rect.left < band.right && rect.right > band.left)
      .sort((a, b) => a.top - b.top);
    let reached = stacked[0]?.bottom ?? 0;

    for (const rect of stacked) {
      largest = Math.max(largest, rect.top - reached);
      reached = Math.max(reached, rect.bottom);
    }
  }

  return largest;
}
