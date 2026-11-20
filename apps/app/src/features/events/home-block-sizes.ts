import type { BlockSize } from "../../shared/dashboard/dashboard-pack";

export interface BlockSizes {
  allowed: readonly BlockSize[];
  defaultSize: BlockSize;
}

export const CHILD_BLOCK_PREFIX = "child:";

const CHILD_BLOCK_PATTERN = `${CHILD_BLOCK_PREFIX}*`;

const GLANCE_OR_LIST: BlockSizes = { allowed: ["s", "m"], defaultSize: "m" };

const LIST_OR_RICH: BlockSizes = { allowed: ["m", "l"], defaultSize: "m" };

export const HOME_BLOCK_SIZES: Readonly<Record<string, BlockSizes>> = {
  calendar: { allowed: ["m", "l", "xl"], defaultSize: "xl" },
  today: { allowed: ["m", "l", "xl"], defaultSize: "l" },
  tonight: { allowed: ["s", "m", "l"], defaultSize: "m" },
  review: GLANCE_OR_LIST,
  progress: GLANCE_OR_LIST,
  documents: GLANCE_OR_LIST,
  outings: GLANCE_OR_LIST,
  overdue: { allowed: ["s", "m", "l"], defaultSize: "m" },
  assessments: LIST_OR_RICH,
  notes: LIST_OR_RICH,
  reminders: LIST_OR_RICH,
  workload: { allowed: ["m", "l", "xl"], defaultSize: "m" },
  welcome: { allowed: ["l", "xl"], defaultSize: "l" },
  [CHILD_BLOCK_PATTERN]: LIST_OR_RICH,
};

export function blockSizesOf(id: string): BlockSizes | undefined {
  const key = id.startsWith(CHILD_BLOCK_PREFIX) ? CHILD_BLOCK_PATTERN : id;

  return HOME_BLOCK_SIZES[key];
}

export function allowsSize(id: string, size: BlockSize): boolean {
  return blockSizesOf(id)?.allowed.includes(size) ?? false;
}
