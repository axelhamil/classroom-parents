import { z } from "zod";
import { BLOCK_SIZES, type BlockSize } from "./dashboard-pack";

export interface LayoutBlock {
  id: string;
  size: BlockSize;
}

const V1_WIDTHS = [3, 4, 6, 8, 12] as const;

type V1Width = (typeof V1_WIDTHS)[number];

const SIZE_OF_V1_WIDTH: Record<V1Width, BlockSize> = { 3: "s", 4: "m", 6: "l", 8: "l", 12: "xl" };

const v1LayoutSchema = z.array(
  z.object({
    id: z.string(),
    w: z.literal(V1_WIDTHS),
    h: z.number(),
    hidden: z.boolean(),
  }),
);

const v2LayoutSchema = z.object({
  v: z.literal(2),
  blocks: z.array(z.object({ id: z.string(), size: z.enum(BLOCK_SIZES) })),
});

/**
 * Reads a stored home layout of either version: a v1 list of `{ id, w, h, hidden }`
 * becomes the v2 order of visible blocks, its width giving the size. `null`
 * means nothing usable is stored, so the advised layout applies.
 */
export function readStoredLayout(stored: unknown): LayoutBlock[] | null {
  const v2 = v2LayoutSchema.safeParse(stored);
  if (v2.success) return v2.data.blocks;

  const v1 = v1LayoutSchema.safeParse(stored);
  if (!v1.success) return null;

  return v1.data
    .filter((block) => !block.hidden)
    .map(({ id, w }) => ({ id, size: SIZE_OF_V1_WIDTH[w] }));
}

/** The allowed size closest to the wanted one, the larger on a tie. */
export function snapSize(size: BlockSize, allowed: readonly BlockSize[]): BlockSize {
  const rank = (candidate: BlockSize) => BLOCK_SIZES.indexOf(candidate);
  const distance = (candidate: BlockSize) => Math.abs(rank(candidate) - rank(size));

  return allowed.reduce((best, candidate) => {
    const gap = distance(candidate) - distance(best);

    return gap < 0 || (gap === 0 && rank(candidate) > rank(best)) ? candidate : best;
  }, allowed[0] ?? size);
}
