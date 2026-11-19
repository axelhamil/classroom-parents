import { z } from "zod";

export const BLOCK_WIDTHS = [3, 4, 6, 8, 12] as const;
export const BLOCK_HEIGHTS = [1, 2, 3] as const;

export type BlockWidth = (typeof BLOCK_WIDTHS)[number];
export type BlockHeight = (typeof BLOCK_HEIGHTS)[number];
export type BlockAxis = "w" | "h";
export type BlockStep = 1 | -1;

export const homeBlockSchema = z.object({
  id: z.string(),
  w: z.literal(BLOCK_WIDTHS),
  h: z.literal(BLOCK_HEIGHTS),
  hidden: z.boolean(),
});

export type HomeBlock = z.infer<typeof homeBlockSchema>;

export interface BlockSizes {
  w: readonly BlockWidth[];
  h: readonly BlockHeight[];
}

export interface BlockShape {
  id: string;
  sizes: BlockSizes;
  defaultSize: { w: BlockWidth; h: BlockHeight };
}

function nearest<T extends number>(value: number, allowed: readonly T[], fallback: T): T {
  return allowed.reduce<T>((best, candidate) => {
    const gap = Math.abs(candidate - value) - Math.abs(best - value);

    return gap < 0 || (gap === 0 && candidate > best) ? candidate : best;
  }, allowed[0] ?? fallback);
}

function snapped(block: HomeBlock, { sizes }: BlockShape): HomeBlock {
  return {
    ...block,
    w: nearest(block.w, sizes.w, block.w),
    h: nearest(block.h, sizes.h, block.h),
  };
}

function missingFrom(layout: readonly HomeBlock[], registry: readonly BlockShape[]): HomeBlock[] {
  const known = new Set(layout.map((block) => block.id));

  return registry
    .filter((shape) => !known.has(shape.id))
    .map((shape) => ({ id: shape.id, ...shape.defaultSize, hidden: true }));
}

/**
 * Makes any stored layout safe to draw: blocks the registry no longer holds
 * and repeated ids go, sizes snap to the steps the block allows, and blocks
 * the layout never heard of are appended hidden, so a new block never pushes
 * itself onto a home the parent arranged.
 */
export function normalizeLayout(
  stored: readonly HomeBlock[] | null,
  registry: readonly BlockShape[],
  defaults: readonly HomeBlock[],
): HomeBlock[] {
  const shapes = new Map(registry.map((shape) => [shape.id, shape]));
  const kept: HomeBlock[] = [];

  for (const block of stored ?? defaults) {
    const shape = shapes.get(block.id);
    if (!shape || kept.some((known) => known.id === block.id)) continue;

    kept.push(snapped(block, shape));
  }

  return [...kept, ...missingFrom(kept, registry)];
}

/** The next allowed step on one axis, or `null` when the block is already at the end. */
export function resizeBlock(
  block: HomeBlock,
  sizes: BlockSizes,
  axis: BlockAxis,
  step: BlockStep,
): HomeBlock | null {
  const allowed: readonly number[] = sizes[axis];
  const next = allowed[allowed.indexOf(block[axis]) + step];
  if (next === undefined) return null;

  return homeBlockSchema.parse({ ...block, [axis]: next });
}

/** Swaps a block with its visible neighbour; hidden blocks keep their place. */
export function moveBlock(
  layout: readonly HomeBlock[],
  id: string,
  step: BlockStep,
): readonly HomeBlock[] {
  const visible = layout.filter((block) => !block.hidden);
  const from = visible.findIndex((block) => block.id === id);
  const neighbour = visible[from + step];
  const moved = visible[from];
  if (!moved || !neighbour) return layout;

  const without = layout.filter((block) => block.id !== id);
  const at = without.indexOf(neighbour) + (step === 1 ? 1 : 0);

  return [...without.slice(0, at), moved, ...without.slice(at)];
}

/** Puts a block in a new place among the visible ones, as a drag drops it. */
export function placeBlock(
  layout: readonly HomeBlock[],
  id: string,
  visibleIndex: number,
): readonly HomeBlock[] {
  const moved = layout.find((block) => block.id === id);
  if (!moved) return layout;

  const without = layout.filter((block) => block.id !== id);
  const anchor = without.filter((block) => !block.hidden)[visibleIndex];
  const at = anchor ? without.indexOf(anchor) : without.length;

  return [...without.slice(0, at), moved, ...without.slice(at)];
}

export function hideBlock(layout: readonly HomeBlock[], id: string): HomeBlock[] {
  return layout.map((block) => (block.id === id ? { ...block, hidden: true } : block));
}

export function showBlock(layout: readonly HomeBlock[], id: string): HomeBlock[] {
  const shown = layout.find((block) => block.id === id);
  if (!shown) return [...layout];

  const others = layout.filter((block) => block.id !== id);
  const visible = others.filter((block) => !block.hidden);

  return [...visible, { ...shown, hidden: false }, ...others.filter((block) => block.hidden)];
}

export function replaceBlock(layout: readonly HomeBlock[], next: HomeBlock): HomeBlock[] {
  return layout.map((block) => (block.id === next.id ? next : block));
}
