import type { BlockSize } from "../src/shared/dashboard/block-size";
import type { StoredLayout } from "../src/shared/dashboard/layout-migration";

export interface Block {
  id: string;
  size: BlockSize;
}

/** Blocks a fixture declares, in the form the server answers them in. */
export function inCases(blocks: readonly Block[] | null | undefined): StoredLayout["blocks"] {
  return blocks?.map(({ id, size }) => ({ id, ...size })) ?? null;
}
