import {
  BLOCK_SIZES,
  type BlockSize,
  type GridUnits,
  type PackedItem,
  pack,
} from "./dashboard-pack";
import type { LayoutBlock } from "./layout-migration";

export type Draft = readonly LayoutBlock[];

export type RowDirection = "up" | "down";

export type Edge = "start" | "end";

export type Step = -1 | 1;

export interface DraftHistory {
  draft: Draft;
  past: readonly Draft[];
}

export function moveToIndex(draft: Draft, id: string, index: number): Draft {
  const from = draft.findIndex((block) => block.id === id);
  const to = Math.min(Math.max(index, 0), draft.length - 1);
  const moved = draft[from];
  if (!moved || from === to) return draft;

  const rest = draft.filter((block) => block.id !== id);

  return [...rest.slice(0, to), moved, ...rest.slice(to)];
}

/**
 * The blocks (or ids) that are not pinned, the ones a saved layout may hold; `items` itself when it
 * holds none, so a layout that only stands for "nothing arranged" keeps its identity.
 */
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

export function moveToRow(
  draft: Draft,
  id: string,
  direction: RowDirection,
  units: GridUnits,
): Draft {
  const items = packDraft(draft, units);
  const moved = items.find((item) => item.id === id);
  if (!moved) return draft;

  const target = items.find((item) => covers(item, centerOf(moved), rowBeside(moved, direction)));
  if (!target) return draft;

  return moveToIndex(draft, id, indexOf(draft, target.id));
}

export function stepSize(
  draft: Draft,
  id: string,
  step: Step,
  allowed: readonly BlockSize[],
): Draft {
  const block = draft.find((candidate) => candidate.id === id);
  if (!block) return draft;

  const size = nextSize(block.size, step, allowed);
  if (!size) return draft;

  return resize(draft, id, size);
}

export function resize(draft: Draft, id: string, size: BlockSize): Draft {
  const block = draft.find((candidate) => candidate.id === id);
  if (!block || block.size === size) return draft;

  return draft.map((candidate) => (candidate === block ? { id, size } : candidate));
}

export function hide(draft: Draft, id: string): Draft {
  if (!draft.some((block) => block.id === id)) return draft;

  return draft.filter((block) => block.id !== id);
}

export function show(draft: Draft, id: string, size: BlockSize): Draft {
  if (draft.some((block) => block.id === id)) return draft;

  return [...draft, { id, size }];
}

export function record(history: DraftHistory, next: Draft): DraftHistory {
  if (next === history.draft) return history;

  return { draft: next, past: [...history.past, history.draft] };
}

export function undo(history: DraftHistory): DraftHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;

  return { draft: previous, past: history.past.slice(0, -1) };
}

function packDraft(draft: Draft, units: GridUnits): PackedItem[] {
  const sizes = new Map(draft.map((block) => [block.id, block.size]));
  const order = draft.map((block) => block.id);

  return pack(order, (blockId) => sizes.get(blockId) ?? "s", units).items;
}

function centerOf(item: PackedItem): number {
  return item.x + item.w / 2;
}

function rowBeside(item: PackedItem, direction: RowDirection): number {
  return direction === "up" ? item.y - 1 : item.y + item.h;
}

function covers(item: PackedItem, x: number, y: number): boolean {
  return item.x <= x && x < item.x + item.w && item.y <= y && y < item.y + item.h;
}

function indexOf(draft: Draft, id: string): number {
  return draft.findIndex((block) => block.id === id);
}

function nextSize(
  size: BlockSize,
  step: Step,
  allowed: readonly BlockSize[],
): BlockSize | undefined {
  const rank = (candidate: BlockSize) => BLOCK_SIZES.indexOf(candidate);
  const larger = BLOCK_SIZES.filter((candidate) => rank(candidate) > rank(size));
  const smaller = BLOCK_SIZES.filter((candidate) => rank(candidate) < rank(size)).reverse();

  return (step === 1 ? larger : smaller).find((candidate) => allowed.includes(candidate));
}
