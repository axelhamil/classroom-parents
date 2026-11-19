import { ListRow } from "@packages/ui/components/ui/list-row";
import {
  defaultRangeExtractor,
  type Range,
  useVirtualizer,
  useWindowVirtualizer,
  type VirtualItem,
} from "@tanstack/react-virtual";
import {
  type FocusEvent,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const VIRTUALIZE_ABOVE = 50;
const OVERSCAN_ROWS = 6;

export interface VirtualListProps<T extends object> {
  items: readonly T[];
  keyOf: (item: T) => string;
  children: (item: T) => ReactNode;
  /**
   * What scrolls the list: the page itself, or, inside an overlay where the page is
   * locked, the `ScrollRegion` around the list. Never a scroller of its own.
   */
  scroller: "page" | "region";
  estimatedRowHeight: number;
  ordered?: boolean;
  rowClassName?: string;
}

/**
 * A list that mounts only the rows near the viewport once it holds more than
 * `VIRTUALIZE_ABOVE` items, and stays a plain list below. Rows keep their measured
 * height, announce their place in the whole list (`aria-setsize`, `aria-posinset`),
 * and the row holding the focus is never unmounted, so keyboard and screen reader
 * users walk the list as if every row were there. The browser's find in page only
 * sees the mounted rows.
 */
export function VirtualList<T extends object>(props: VirtualListProps<T>) {
  const { items, keyOf, children, ordered, rowClassName } = props;
  const List = ordered ? "ol" : "ul";

  if (items.length <= VIRTUALIZE_ABOVE)
    return (
      <List className="flex flex-col">
        {items.map((item) => (
          <ListRow key={keyOf(item)} variant="plain" className={rowClassName}>
            {children(item)}
          </ListRow>
        ))}
      </List>
    );

  return props.scroller === "page" ? <PageRows {...props} /> : <RegionRows {...props} />;
}

function PageRows<T extends object>(props: VirtualListProps<T>) {
  const [list, setList] = useState<HTMLElement | null>(null);
  const kept = useKeptFocus();
  const scrollMargin = useListOffset(list, null);
  const virtualizer = useWindowVirtualizer({
    ...rowOptions(props, kept.rangeExtractor),
    scrollMargin,
  });

  return (
    <Rows
      {...props}
      listRef={setList}
      kept={kept}
      rows={virtualizer.getVirtualItems()}
      height={virtualizer.getTotalSize()}
      offset={scrollMargin}
      measure={virtualizer.measureElement}
    />
  );
}

function RegionRows<T extends object>(props: VirtualListProps<T>) {
  const [list, setList] = useState<HTMLElement | null>(null);
  const kept = useKeptFocus();
  const region = list?.closest<HTMLElement>("[data-slot=scroll-region]") ?? null;
  const scrollMargin = useListOffset(list, region);
  const virtualizer = useVirtualizer({
    ...rowOptions(props, kept.rangeExtractor),
    getScrollElement: () => region,
    scrollMargin,
  });

  return (
    <Rows
      {...props}
      listRef={setList}
      kept={kept}
      rows={virtualizer.getVirtualItems()}
      height={virtualizer.getTotalSize()}
      offset={scrollMargin}
      measure={virtualizer.measureElement}
    />
  );
}

function rowOptions<T extends object>(
  { items, keyOf, estimatedRowHeight }: VirtualListProps<T>,
  rangeExtractor: (range: Range) => number[],
) {
  return {
    count: items.length,
    estimateSize: () => estimatedRowHeight,
    overscan: OVERSCAN_ROWS,
    getItemKey: (index: number) => {
      const item = items[index];
      return item === undefined ? index : keyOf(item);
    },
    rangeExtractor,
    useFlushSync: false,
  };
}

function rowIndexOf(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;

  const index = Number(target.closest("[data-index]")?.getAttribute("data-index"));
  return Number.isInteger(index) ? index : null;
}

interface KeptFocus {
  rangeExtractor: (range: Range) => number[];
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
}

function useKeptFocus(): KeptFocus {
  const [focused, setFocused] = useState<number | null>(null);

  const rangeExtractor = useCallback(
    (range: Range) => {
      const rows = defaultRangeExtractor(range);
      if (focused === null) return rows;

      const around = Array.from(
        { length: OVERSCAN_ROWS * 2 + 1 },
        (_, step) => focused - OVERSCAN_ROWS + step,
      ).filter((index) => index >= 0 && index < range.count);
      return [...new Set([...rows, ...around])].sort((left, right) => left - right);
    },
    [focused],
  );

  return {
    rangeExtractor,
    onFocus: (event) => setFocused(rowIndexOf(event.target)),
    onBlur: (event) => {
      const stays =
        event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget);
      if (!stays) setFocused(null);
    },
  };
}

function useListOffset(list: HTMLElement | null, region: HTMLElement | null): number {
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    if (!list) return;

    const measure = () => {
      const top = list.getBoundingClientRect().top;
      setOffset(
        region ? top - region.getBoundingClientRect().top + region.scrollTop : top + window.scrollY,
      );
    };
    measure();
    if (typeof ResizeObserver !== "function") return;

    const observer = new ResizeObserver(measure);
    observer.observe(region ?? document.body);
    return () => observer.disconnect();
  }, [list, region]);

  return offset;
}

interface RowsProps<T extends object> extends VirtualListProps<T> {
  listRef: (node: HTMLElement | null) => void;
  kept: KeptFocus;
  rows: VirtualItem[];
  height: number;
  offset: number;
  measure: (node: Element | null) => void;
}

function Rows<T extends object>(props: RowsProps<T>) {
  const { items, ordered, listRef, kept, rows, height, offset, measure, rowClassName } = props;
  const List = ordered ? "ol" : "ul";
  const content = useRenderedOnce(props.children);

  return (
    <List
      ref={listRef}
      className="relative w-full"
      style={{ height }}
      onFocus={kept.onFocus}
      onBlur={kept.onBlur}
    >
      {rows.map((row) => {
        const item = items[row.index];
        if (item === undefined) return null;

        return (
          <ListRow
            key={row.key}
            ref={measure}
            data-index={row.index}
            aria-setsize={items.length}
            aria-posinset={row.index + 1}
            variant="plain"
            className={`absolute inset-x-0 top-0 ${rowClassName ?? ""}`}
            style={{ transform: `translateY(${row.start - offset}px)` }}
          >
            {content(item)}
          </ListRow>
        );
      })}
    </List>
  );
}

/**
 * Renders each item once per `render`: a scroll re-renders the mounted rows, and handing
 * React the same element lets it skip the row's content instead of rebuilding it.
 */
function useRenderedOnce<T extends object>(render: (item: T) => ReactNode) {
  const cache = useRef<{ render: typeof render; rendered: WeakMap<T, ReactNode> } | null>(null);
  if (cache.current?.render !== render) cache.current = { render, rendered: new WeakMap() };
  const { rendered } = cache.current;

  return (item: T) => {
    if (rendered.has(item)) return rendered.get(item);

    const node = render(item);
    rendered.set(item, node);
    return node;
  };
}
