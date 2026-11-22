import type { BlockSize, Bounds, GridColumns } from "../../shared/dashboard/block-size";
import {
  ADVISED,
  type Draft,
  type HomeLayout,
  isAdvised,
  withoutPinned,
} from "../../shared/dashboard/layout-commands";
import type { LayoutBlock } from "../../shared/dashboard/layout-migration";
import type { AdviceSnapshot } from "./advise-context";
import { adviseLayout } from "./advise-layout";
import { ADVICE_ONLY_BLOCK_IDS, boundsOf } from "./home-block-bounds";

/** The home the advice lays out: its blocks in reading order, and the one that answers the moment. */
export interface AdvisedHome {
  blocks: Draft;
  heroId: string;
}

/**
 * The advice for a snapshot of the family's facts at a column count, over the blocks the home can
 * draw. Its sizes are kept as advised: chosen for these columns, held to the bounds there, they
 * are never raised again to a minimum width the screen does not have.
 */
export function advisedHomeOf(
  snapshot: AdviceSnapshot,
  columns: GridColumns,
  registry: readonly string[],
): AdvisedHome {
  const { heroId, blocks } = adviseLayout(snapshot.context, columns, snapshot.emptyBlocks);

  return { heroId, blocks: drawable(blocks, registry) };
}

/** The layout a stored answer stands for: the blocks the home can draw, or the advice when none was saved. */
export function layoutOf(
  blocks: readonly LayoutBlock[] | null,
  registry: readonly string[],
): HomeLayout {
  return blocks ? fitToRegistry(savable(blocks), registry) : ADVISED;
}

/** The blocks a layout saves: none for the advice, and never a block only the advice places. */
export function savedBlocksOf(layout: HomeLayout): LayoutBlock[] | null {
  return isAdvised(layout) ? null : savable(layout);
}

/**
 * The blocks the home can draw, once each, no larger than their bounds. The width is not held to
 * the columns on screen: a block chosen wide on a large screen stays wide for it. A minimum is not
 * raised either: a size chosen where the columns cut it, the advice of a phone or a step there, is
 * kept as chosen, and each screen raises it to the minimums it draws with.
 */
export function fitToRegistry(blocks: readonly LayoutBlock[], registry: readonly string[]): Draft {
  return drawable(blocks, registry).flatMap(({ id, size }) => {
    const sizing = boundsOf(id);

    return sizing ? [{ id, size: atMost(size, sizing.bounds) }] : [];
  });
}

/** The blocks the home has a definition and bounds for, each once, in the order given. */
function drawable(blocks: readonly LayoutBlock[], registry: readonly string[]): Draft {
  const known = new Set(registry);
  const seen = new Set<string>();

  return blocks.filter((block) => {
    const fresh = known.has(block.id) && !seen.has(block.id) && boundsOf(block.id) !== undefined;
    seen.add(block.id);

    return fresh;
  });
}

/** A layout the parent keeps: the blocks only the advice places are left out, whoever wrote them. */
function savable(blocks: readonly LayoutBlock[]): LayoutBlock[] {
  return [...withoutPinned(blocks, ADVICE_ONLY_BLOCK_IDS)];
}

function atMost({ w, h }: BlockSize, { maxW, maxH }: Bounds): BlockSize {
  return { w: Math.min(w, maxW), h: Math.min(h, maxH) };
}
