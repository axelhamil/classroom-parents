import { z } from "zod";
import type { BlockSize } from "./block-size";

/** A block as the layout keeps it: its size in cases of the grid, as wide as the parent chose it. */
export interface LayoutBlock {
  id: string;
  size: BlockSize;
}

const STORED_LAYOUT_VERSION = 3;

/**
 * The layout as the server answers it and the device keeps it, `blocks: null` standing for the
 * advised layout. Only this version is read: the server converts the older ones, so a copy in
 * another form is left for the server's answer.
 */
export const storedLayoutSchema = z.object({
  v: z.literal(STORED_LAYOUT_VERSION),
  blocks: z
    .array(
      z.object({ id: z.string(), w: z.number().int().positive(), h: z.number().int().positive() }),
    )
    .nullable(),
});

export type StoredLayout = z.infer<typeof storedLayoutSchema>;

/** The blocks of a stored layout, or `null` when the advised layout applies or the form is unknown. */
export function readStoredLayout(stored: unknown): LayoutBlock[] | null {
  const parsed = storedLayoutSchema.safeParse(stored);
  if (!parsed.success || parsed.data.blocks === null) return null;

  return parsed.data.blocks.map(({ id, w, h }) => ({ id, size: { w, h } }));
}

/** The stored form of blocks in cases, `null` saving the advised layout. */
export function storedLayoutOf(blocks: readonly LayoutBlock[] | null): StoredLayout {
  return {
    v: STORED_LAYOUT_VERSION,
    blocks: blocks?.map(({ id, size }) => ({ id, ...size })) ?? null,
  };
}
