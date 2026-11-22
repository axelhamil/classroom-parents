import { type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type BlockSizing, type Bounds, type GridColumns, resizeBounds } from "./block-size";
import type { FlowingTile } from "./edit/edit-geometry";
import type { KeptScroll } from "./tile-frame";
import type { HomeEditActor } from "./use-home-commands";

/**
 * The bounds each block is resized within at this width, the same object while the width and a
 * held height hold, so a tile's frame stays memoized.
 */
export function useGridBounds(
  cols: GridColumns,
): (block: { sizing: BlockSizing }, heldHeight: number | undefined) => Bounds {
  return useMemo(() => {
    const cache = new WeakMap<BlockSizing, Map<number | undefined, Bounds>>();

    return ({ sizing }, heldHeight) => {
      const known = cache.get(sizing) ?? new Map<number | undefined, Bounds>();
      cache.set(sizing, known);
      const bounds = known.get(heldHeight) ?? resizeBounds(sizing, cols, heldHeight);
      known.set(heldHeight, bounds);

      return bounds;
    };
  }, [cols]);
}

/** The edit mode told the columns of the grid, so a row move and a resize read the width on screen. */
export function useColumnsOf(actor: HomeEditActor, columns: GridColumns): void {
  useEffect(() => {
    actor.send({ type: "BREAKPOINT_CHANGED", columns });
  }, [actor, columns]);
}

/** Where each block was scrolled, kept across the two grids so arranging the home loses no place. */
export function useKeptScrolls(): (id: string) => KeptScroll {
  const [scrolls] = useState(() => {
    const tops = new Map<string, number>();
    const kept = new Map<string, KeptScroll>();

    return (id: string) => {
      const known = kept.get(id);
      if (known) return known;

      const scroll: KeptScroll = {
        read: () => tops.get(id),
        keep: (top) => tops.set(id, top),
      };
      kept.set(id, scroll);

      return scroll;
    };
  });

  return scrolls;
}

/**
 * The handle a key moved keeps the focus: React takes the node out and puts it back when its tile
 * changes place, which would otherwise drop the focus on the page.
 */
export function useHandleFocus() {
  const kept = useRef<string | null>(null);

  useLayoutEffect(() => {
    const id = kept.current;
    if (!id) return;

    const handle = document.querySelector<HTMLElement>(`[data-handle="${CSS.escape(id)}"]`);
    if (handle && document.activeElement !== handle) handle.focus();
  });

  return {
    keep: (id: string) => {
      kept.current = id;
    },
  };
}

/**
 * On a phone the tile that flows with the page takes the height of its content; arranging keeps
 * that height, measured as read.
 */
export function useFlowingHeight(cols: GridColumns): FlowingTile | undefined {
  const [flow] = useState(() => {
    const tile = document.querySelector<HTMLElement>("[data-slot=dashboard] [data-flows]");
    const id = tile?.dataset.block;

    return tile && id ? { id, px: tile.getBoundingClientRect().height } : undefined;
  });

  return cols === 1 ? flow : undefined;
}

/**
 * Added to an announcement that repeats the last one word for word, a step stopped by a bound
 * pressed again: the live region changes, so a screen reader reads it once more.
 */
const AGAIN = "\u00a0";

/** What the live region of the home says, and how to say it again when it repeats. */
export function useAnnouncement(): [string, (text: string) => void] {
  const [announcement, setAnnouncement] = useState("");
  const [announce] = useState(
    () => (text: string) => setAnnouncement((said) => (said === text ? `${text}${AGAIN}` : text)),
  );

  return [announcement, announce];
}

/** Escape and Ctrl+Z from the controls of the arranged home: leave it, or undo the last change. */
export function leaveOnKey(actor: HomeEditActor) {
  return (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;

    if (event.key === "Escape") actor.send({ type: "ESC" });
    if (event.key === "z" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      actor.send({ type: "UNDO" });
    }
  };
}
