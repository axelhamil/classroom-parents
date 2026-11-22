import {
  type BlockSize,
  type BlockSizing,
  type Bounds,
  type GridColumns,
  holdWithin,
} from "./block-size";
import type { Placed } from "./dashboard-pack";
import type { LayoutBlock } from "./layout-migration";
import { packedAt } from "./read-geometry";

export type Draft = readonly LayoutBlock[];

/**
 * The layout of a home where the parent arranged nothing: it follows the advice and is saved as
 * `blocks: null`. Told apart by its kind, so a copy of it is still the advice.
 */
export interface AdvisedLayout {
  readonly kind: "advised";
}

export const ADVISED: AdvisedLayout = { kind: "advised" };

/** What a home shows: the blocks the parent arranged, or the advice. */
export type HomeLayout = Draft | AdvisedLayout;

const NO_BLOCKS: Draft = [];

export function isAdvised(layout: HomeLayout): layout is AdvisedLayout {
  return "kind" in layout;
}

/** The blocks a layout holds, none for the advice: what a command on it starts from. */
export function blocksIn(layout: HomeLayout): Draft {
  return isAdvised(layout) ? NO_BLOCKS : layout;
}

export type RowDirection = "up" | "down";

export type Edge = "start" | "end";

export type Step = -1 | 1;

/** The side of a block a size command moves: its width or its height. */
export type Axis = "w" | "h";

/** One case more or less on one side of a block: what a key, a menu item or a handle asks for. */
export interface SizeStep {
  axis: Axis;
  step: Step;
}

export interface DraftHistory {
  draft: HomeLayout;
  past: readonly HomeLayout[];
}

export function moveToIndex(draft: Draft, id: string, index: number): Draft {
  const from = draft.findIndex((block) => block.id === id);
  const to = Math.min(Math.max(index, 0), draft.length - 1);
  const moved = draft[from];
  if (!moved || from === to) return draft;

  const rest = draft.filter((block) => block.id !== id);

  return [...rest.slice(0, to), moved, ...rest.slice(to)];
}

/** The blocks (or ids) that are not pinned, the ones a saved layout may hold; `items` itself when it holds none. */
export function withoutPinned<Item extends string | { id: string }>(
  items: readonly Item[],
  pinnedIds: readonly string[],
): readonly Item[] {
  const pinned = (item: Item) => pinnedIds.includes(typeof item === "string" ? item : item.id);
  if (!items.some(pinned)) return items;

  return items.filter((item) => !pinned(item));
}

/**
 * `next` with each pinned block (or id) of `previous` back at the index it held, so arranging the others
 * never moves it; `next` itself when none moved, which keeps a no-op a no-op.
 */
export function keepPinned<Item extends string | { id: string }>(
  previous: readonly Item[],
  next: readonly Item[],
  pinnedIds: readonly string[],
): readonly Item[] {
  const idOf = (item: Item) => (typeof item === "string" ? item : item.id);
  const pinned = (item: Item) => pinnedIds.includes(idOf(item));
  const held = previous.flatMap((item, index) =>
    pinned(item) && next.some((other) => idOf(other) === idOf(item)) ? [{ item, index }] : [],
  );
  const inPlace = ({ item, index }: { item: Item; index: number }) => {
    const there = next[index];

    return there !== undefined && idOf(there) === idOf(item);
  };
  if (held.every(inPlace)) return next;

  return held.reduce<readonly Item[]>(
    (order, { item, index }) => [...order.slice(0, index), item, ...order.slice(index)],
    next.filter((item) => !pinned(item)),
  );
}

export function moveBy(draft: Draft, id: string, step: Step): Draft {
  const from = draft.findIndex((block) => block.id === id);
  if (from < 0) return draft;

  return moveToIndex(draft, id, from + step);
}

export function moveToEdge(draft: Draft, id: string, edge: Edge): Draft {
  return moveToIndex(draft, id, edge === "start" ? 0 : draft.length - 1);
}

/** The block in the place of the one drawn above or under its centre, on the rectangles drawn on screen. */
export function moveToRow(
  draft: Draft,
  id: string,
  direction: RowDirection,
  columns: GridColumns,
  sizingOf: (id: string) => BlockSizing | undefined,
): Draft {
  const items = packedAt(draft, columns, sizingOf);
  const moved = items.find((item) => item.id === id);
  if (!moved) return draft;

  const target = items.find((item) => covers(item, centerOf(moved), rowBeside(moved, direction)));
  if (!target) return draft;

  return moveToIndex(draft, id, indexOf(draft, target.id));
}

/**
 * The block one case wider, narrower, higher or lower than the rectangle it is drawn in, which may
 * be larger than its size where the grid grew it to leave no hole. `bounds` are the ones the tile
 * is resized within on screen.
 */
export function stepSize(
  draft: Draft,
  id: string,
  drawn: BlockSize,
  change: SizeStep,
  bounds: Bounds,
): Draft {
  const target = steppedSize(drawn, change, bounds);
  if (!target) return draft;

  return resize(draft, id, drawn, target);
}

/**
 * The size one case wider, narrower, higher or lower, held within the bounds, or nothing once the
 * side already reaches its bound, or goes past it where the grid grew the block.
 */
export function steppedSize(
  size: BlockSize,
  { axis, step }: SizeStep,
  bounds: Bounds,
): BlockSize | undefined {
  const [least, most] = axis === "w" ? [bounds.minW, bounds.maxW] : [bounds.minH, bounds.maxH];
  const stopped = step > 0 ? size[axis] >= most : size[axis] <= least;
  if (stopped) return undefined;

  return holdWithin({ ...size, [axis]: size[axis] + step }, bounds);
}

/**
 * The size a step stores, or nothing when it would store none: stopped by a bound, or narrowing
 * a tile the grid grew past a size already as small. What greys a size command out.
 */
export function steppedStored(
  stored: BlockSize,
  drawn: BlockSize,
  change: SizeStep,
  bounds: Bounds,
): BlockSize | undefined {
  const target = steppedSize(drawn, change, bounds);
  if (!target) return undefined;

  const next = resizedStored(stored, drawn, target);

  return sameSize(next, stored) ? undefined : next;
}

/**
 * The block once a side of the rectangle it is drawn in moved to `target`. Only a moved side is
 * stored, and never against the gesture: narrowing never widens what is kept, widening never
 * narrows it. A side left as drawn keeps the size the block was given, so a wider screen draws it
 * whole again; a resize that stores nothing leaves the draft as it is.
 */
export function resize(draft: Draft, id: string, drawn: BlockSize, target: BlockSize): Draft {
  const block = draft.find((candidate) => candidate.id === id);
  if (!block) return draft;

  const size = resizedStored(block.size, drawn, target);
  if (sameSize(size, block.size)) return draft;

  return draft.map((candidate) => (candidate === block ? { id, size } : candidate));
}

function resizedStored(stored: BlockSize, drawn: BlockSize, target: BlockSize): BlockSize {
  const side = (axis: Axis) => {
    if (target[axis] === drawn[axis]) return stored[axis];

    return target[axis] < drawn[axis]
      ? Math.min(stored[axis], target[axis])
      : Math.max(stored[axis], target[axis]);
  };

  return { w: side("w"), h: side("h") };
}

function sameSize(left: BlockSize, right: BlockSize): boolean {
  return left.w === right.w && left.h === right.h;
}

export function hide(draft: Draft, id: string): Draft {
  if (!draft.some((block) => block.id === id)) return draft;

  return draft.filter((block) => block.id !== id);
}

export function show(draft: Draft, id: string, size: BlockSize): Draft {
  if (draft.some((block) => block.id === id)) return draft;

  return [...draft, { id, size }];
}

export function record(history: DraftHistory, next: HomeLayout): DraftHistory {
  if (next === history.draft) return history;

  return { draft: next, past: [...history.past, history.draft] };
}

export function undo(history: DraftHistory): DraftHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;

  return { draft: previous, past: history.past.slice(0, -1) };
}

function centerOf(item: Placed): number {
  return item.x + item.w / 2;
}

function rowBeside(item: Placed, direction: RowDirection): number {
  return direction === "up" ? item.y - 1 : item.y + item.h;
}

function covers(item: Placed, x: number, y: number): boolean {
  return item.x <= x && x < item.x + item.w && item.y <= y && y < item.y + item.h;
}

function indexOf(draft: Draft, id: string): number {
  return draft.findIndex((block) => block.id === id);
}
