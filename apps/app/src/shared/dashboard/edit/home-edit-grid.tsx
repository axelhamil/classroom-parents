import { Dashboard } from "@packages/ui/components/ui/dashboard";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type EventCallback, GridLayout, type Layout, useContainerWidth } from "react-grid-layout";
import { defaultConstraints } from "react-grid-layout/core";
import { touchFeedback } from "../../motion/haptic";
import { type BlockSize, type BlockSizing, type GridColumns, sizeAt, sizeKey } from "../block-size";
import type { Draft } from "../layout-commands";
import type { LayoutBlock } from "../layout-migration";
import { createCellCompactor, heldStill } from "./cell-compactor";
import { editGridConfig, editSlots, type FlowingTile, type GridMetrics } from "./edit-geometry";
import { boundedLayout, pulledSize, type ResizeStart, sizeConstraint } from "./size-constraint";
import { createWindowEdgeScroll, type Pointer, pointerOf } from "./window-edge-scroll";

/** What the edit grid tells the edit mode, one discrete fact at a time, never a pointer frame. */
export interface EditGridEvents {
  onLift: (id: string) => void;
  onIndex: (index: number) => void;
  onDrop: () => void;
  onCancel: () => void;
  onResizeStart: (id: string) => void;
  /** The rectangle the tile was drawn in when the gesture began, in cases, and the one it is pulled to. */
  onResize: (drawn: BlockSize, size: BlockSize) => void;
  onResizeEnd: () => void;
}

export interface HomeEditGridProps extends EditGridEvents {
  order: Draft;
  cols: GridColumns;
  /** The tile drawn at the height of its content: it keeps that height, no handle changes it. */
  flow: FlowingTile | undefined;
  sizingOf: (id: string) => BlockSizing | undefined;
  /** Blocks drawn where they stand while the others are arranged: no drag, no resize, never displaced. */
  pinned: readonly string[];
  renderTile: (block: LayoutBlock) => ReactNode;
  /** Drawn until the grid knows its width and its row height: the read grid, in the same rectangles. */
  fallback: ReactNode;
}

const HANDLE = "[data-slot=dashboard-tile-toolbar]";

const NOT_A_HANDLE = "[data-no-drag], [data-handle]";

const ONE_CASE: BlockSize = { w: 1, h: 1 };

const UNPLACED = { x: 0, y: Number.MAX_SAFE_INTEGER };

const RESIZE_HANDLES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;

interface LiveResize {
  id: string;
  size: BlockSize;
}

/**
 * The home while it is arranged, on react-grid-layout: the same rectangles as the read grid, the
 * order packed by cells on every move, the page scrolled when the finger holds at its edge, and
 * every edge and corner of a tile to resize it by whole cases, with a mouse or a finger. Loaded
 * only once the parent arranges their home.
 */
export default function HomeEditGrid(props: HomeEditGridProps) {
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
  const probe = useRef<HTMLDivElement>(null);
  const metrics = useGridMetrics(probe, props.cols, width);

  return (
    <div ref={containerRef}>
      <Dashboard ref={probe} columns={props.cols} aria-hidden className="invisible absolute h-0" />
      {mounted && metrics ? (
        <EditGrid {...props} width={width} metrics={metrics} />
      ) : (
        props.fallback
      )}
    </div>
  );
}

interface EditGridProps extends HomeEditGridProps {
  width: number;
  metrics: GridMetrics;
}

function EditGrid({
  order,
  flow,
  sizingOf,
  pinned,
  renderTile,
  width,
  metrics,
  fallback: _fallback,
  ...events
}: EditGridProps) {
  const ids = useMemo(() => order.map(({ id }) => id), [order]);
  const live = useRef<LiveResize | null>(null);
  const start = useRef<ResizeStart | null>(null);
  const refs = useCompactorRefs(
    { ids, order, metrics, flow, pinned },
    sizingOf,
    live,
    events.onIndex,
  );
  const [compactor] = useState(() => createCellCompactor(refs));
  const edge = useEdgeScroll();
  const slots = useMemo(() => {
    const sizeOf = (id: string) => sizeAt(sizeIn(order, id), sizingOf(id), metrics.cols);

    return editSlots(ids, sizeOf, metrics, flow);
  }, [ids, order, metrics, flow, sizingOf]);
  const layout = useMemo(
    () => heldStill(boundedLayout(slots, sizingOf, metrics, flow), pinned),
    [slots, sizingOf, metrics, flow, pinned],
  );
  const constraints = useMemo(
    () => [...defaultConstraints, sizeConstraint(sizingOf, metrics)],
    [sizingOf, metrics],
  );
  const config = editGridConfig(metrics);
  const lifted = useRef(false);

  const endDrag = () => {
    edge.stop();
    refs.active.current = null;
    lifted.current = false;
  };

  useCancelOnInterruption(lifted, () => {
    endDrag();
    events.onCancel();
  });

  const onDragStart: EventCallback = (_layout, item) => {
    if (!item) return;

    refs.active.current = item.i;
    lifted.current = true;
    touchFeedback("lift");
    events.onLift(item.i);
  };

  const onDrag: EventCallback = (_layout, _old, _item, _placeholder, event) => {
    const pointer = pointerOf(event);
    if (pointer) edge.feed(pointer.clientX, pointer.clientY, event);
  };

  const onDragStop: EventCallback = () => {
    if (!lifted.current) return;

    endDrag();
    touchFeedback("drop");
    events.onDrop();
  };

  const onResizeStart: EventCallback = (_layout, item) => {
    const drawn = item && slots.find((slot) => slot.item.i === item.i)?.units;
    if (!item || !drawn) return;

    start.current = { id: item.i, h: item.h, drawn };
    events.onResizeStart(item.i);
  };

  const onResize: EventCallback = (_layout, _old, item) => {
    const from = start.current;
    if (!item || from?.id !== item.i) return;

    const size = pulledSize(from, item, sizingOf(item.i), metrics);
    if (live.current?.size.w === size.w && live.current.size.h === size.h) return;

    live.current = { id: item.i, size };
    events.onResize(from.drawn, size);
  };

  const onResizeStop: EventCallback = () => {
    live.current = null;
    start.current = null;
    events.onResizeEnd();
  };

  return (
    <GridLayout
      className="dashboard-edit"
      width={width}
      layout={layout}
      compactor={compactor}
      constraints={constraints}
      gridConfig={config}
      dragConfig={{ handle: HANDLE, cancel: NOT_A_HANDLE, threshold: 3 }}
      resizeConfig={{ enabled: true, handles: RESIZE_HANDLES }}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragStop={onDragStop}
      onResizeStart={onResizeStart}
      onResize={onResize}
      onResizeStop={onResizeStop}
    >
      {inReadingOrder(order, layout).map((block) => (
        <div
          key={block.id}
          data-block={block.id}
          data-size={sizeKey(block.size)}
          data-gap-below={config.tileGap ? "" : undefined}
          className="flex flex-col"
        >
          {renderTile(block)}
        </div>
      ))}
    </GridLayout>
  );
}

function useGridMetrics(
  probe: RefObject<HTMLDivElement | null>,
  cols: GridColumns,
  width: number,
): GridMetrics | null {
  const [metrics, setMetrics] = useState<GridMetrics | null>(null);

  useLayoutEffect(() => {
    const grid = probe.current;
    if (!grid || width === 0) return;

    const style = getComputedStyle(grid);
    const rowHeight = Number.parseFloat(style.gridAutoRows);
    const gap = Number.parseFloat(style.rowGap);

    setMetrics((current) =>
      current?.cols === cols && current.rowHeight === rowHeight && current.gap === gap
        ? current
        : { cols, rowHeight, gap },
    );
  }, [probe, cols, width]);

  return metrics;
}

interface CompactorInputs {
  ids: readonly string[];
  order: Draft;
  metrics: GridMetrics;
  flow: FlowingTile | undefined;
  pinned: readonly string[];
}

function useCompactorRefs(
  { ids, order, metrics, flow, pinned }: CompactorInputs,
  sizingOf: (id: string) => BlockSizing | undefined,
  live: RefObject<LiveResize | null>,
  onIndex: (index: number) => void,
) {
  const sizeOf = (id: string): BlockSize => {
    const size = live.current?.id === id ? live.current.size : sizeIn(order, id);

    return sizeAt(size, sizingOf(id), metrics.cols);
  };
  const reportIndex = (_id: string, index: number) => {
    touchFeedback("step");
    onIndex(index);
  };
  const refs = {
    order: useRef(ids),
    active: useRef<string | null>(null),
    metrics: useRef(metrics),
    flow: useRef(flow),
    sizeOf: useRef(sizeOf),
    onIndexChange: useRef(reportIndex),
    pinned: useRef(pinned),
  };

  refs.order.current = ids;
  refs.metrics.current = metrics;
  refs.flow.current = flow;
  refs.sizeOf.current = sizeOf;
  refs.onIndexChange.current = reportIndex;
  refs.pinned.current = pinned;

  return refs;
}

function sizeIn(order: Draft, id: string): BlockSize {
  return order.find((block) => block.id === id)?.size ?? ONE_CASE;
}

/** The blocks in the order a reader meets them on the grid, row by row: the order of the DOM and of Tab. */
function inReadingOrder(order: Draft, layout: Layout): Draft {
  const place = new Map(layout.map((item) => [item.i, item]));
  const placeOf = (id: string) => place.get(id) ?? UNPLACED;

  return [...order].sort((a, b) => {
    const first = placeOf(a.id);
    const second = placeOf(b.id);

    return first.y - second.y || first.x - second.x;
  });
}

interface EdgeScroll {
  feed: (clientX: number, clientY: number, event: Event) => void;
  stop: () => void;
}

/**
 * The page scrolled while the finger holds at the edge of the screen. The library moves the tile
 * from pointer events only, so while the page scrolls under a still finger the last position is
 * sent again: the tile stays under the finger instead of riding up with the page.
 */
function useEdgeScroll(): EdgeScroll {
  const source = useRef<Event | null>(null);
  const [scroller] = useState(() =>
    createWindowEdgeScroll({ onScroll: (pointer) => replay(source.current, pointer) }),
  );

  useEffect(() => () => scroller.stop(), [scroller]);

  return {
    feed: (clientX, clientY, event) => {
      if (event.isTrusted) source.current = event;
      scroller.feed(clientX, clientY);
    },
    stop: () => {
      source.current = null;
      scroller.stop();
    },
  };
}

function replay(source: Event | null, { clientX, clientY }: Pointer): void {
  if (!source) return;

  if (source instanceof MouseEvent) {
    document.dispatchEvent(new MouseEvent("mousemove", { clientX, clientY, bubbles: true }));
    return;
  }

  if (typeof TouchEvent === "undefined" || !(source instanceof TouchEvent)) return;

  const touch = source.changedTouches[0];
  if (!touch || typeof Touch !== "function") return;

  const moved = new Touch({ identifier: touch.identifier, target: touch.target, clientX, clientY });
  const init = { touches: [moved], targetTouches: [moved], changedTouches: [moved] };

  touch.target.dispatchEvent(
    new TouchEvent("touchmove", { ...init, bubbles: true, cancelable: true }),
  );
}

/** Escape, a lost pointer or a hidden page puts a lifted tile back where it was. */
function useCancelOnInterruption(lifted: RefObject<boolean>, cancel: () => void): void {
  const latest = useRef(cancel);
  latest.current = cancel;

  useEffect(() => {
    const interrupt = () => {
      if (lifted.current) latest.current();
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") interrupt();
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") interrupt();
    };

    document.addEventListener("keydown", onEscape);
    document.addEventListener("pointercancel", interrupt);
    document.addEventListener("visibilitychange", hidden);

    return () => {
      document.removeEventListener("keydown", onEscape);
      document.removeEventListener("pointercancel", interrupt);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [lifted]);
}
