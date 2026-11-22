import type { BlockSize, BlockSizing, RaisedMinimum } from "../../shared/dashboard/block-size";

export const CHILD_BLOCK_PREFIX = "child:";

const CHILD_BLOCK_PATTERN = `${CHILD_BLOCK_PREFIX}*`;

/** One case: the size a block shows at a glance. */
export const ONE_CASE: BlockSize = { w: 1, h: 1 };

/** Two columns on one row. */
export const ONE_ROW: BlockSize = { w: 2, h: 1 };

/** Two columns on two rows. */
export const TWO_ROWS: BlockSize = { w: 2, h: 2 };

const GLANCE_BOUNDS = { minW: 1, maxW: 2, minH: 1, maxH: 3 };

const LIST_BOUNDS = { ...GLANCE_BOUNDS, minW: 2 };

const GLANCE_ROW: BlockSizing = { bounds: GLANCE_BOUNDS, defaultSize: ONE_ROW };

const LIST_ROW: BlockSizing = { bounds: LIST_BOUNDS, defaultSize: ONE_ROW };

const TWO_ROWS_ON_PHONE: RaisedMinimum = { columns: 1, minH: 2 };

/**
 * Notes is a field to write in: never a glance. One column is wide enough for it on two rows, at 3
 * columns where nothing wider stands beside a hero; at 2 and 4 columns it keeps two columns.
 */
const NOTES: BlockSizing = {
  bounds: GLANCE_BOUNDS,
  defaultSize: ONE_ROW,
  raisedAt: [
    TWO_ROWS_ON_PHONE,
    { columns: 2, minW: 2 },
    { columns: 3, minH: 2 },
    { columns: 4, minW: 2 },
  ],
};

const HOME_BLOCK_BOUNDS: Readonly<Record<string, BlockSizing>> = {
  calendar: {
    bounds: { minW: 2, maxW: 4, minH: 2, maxH: 4 },
    defaultSize: { w: 4, h: 2 },
    raisedAt: [{ columns: 2, minH: 3 }],
  },
  today: {
    bounds: { ...LIST_BOUNDS, maxW: 4 },
    defaultSize: TWO_ROWS,
    raisedAt: [TWO_ROWS_ON_PHONE],
  },
  tonight: GLANCE_ROW,
  review: { bounds: { ...GLANCE_BOUNDS, maxW: 4 }, defaultSize: ONE_ROW },
  progress: GLANCE_ROW,
  documents: GLANCE_ROW,
  outings: GLANCE_ROW,
  overdue: GLANCE_ROW,
  assessments: LIST_ROW,
  notes: NOTES,
  reminders: LIST_ROW,
  workload: { bounds: { ...LIST_BOUNDS, maxW: 4 }, defaultSize: ONE_ROW },
  welcome: { bounds: { minW: 2, maxW: 4, minH: 2, maxH: 3 }, defaultSize: TWO_ROWS },
  [CHILD_BLOCK_PATTERN]: LIST_ROW,
};

/** The id of every block the home sizes, `child:*` standing for the block of each child. */
export const HOME_BLOCK_PATTERNS: readonly string[] = Object.keys(HOME_BLOCK_BOUNDS);

/** Blocks only the advice places: never offered in the drawer, never saved in a layout. */
export const ADVICE_ONLY_BLOCK_IDS = ["welcome"] as const;

export function boundsOf(id: string): BlockSizing | undefined {
  const key = id.startsWith(CHILD_BLOCK_PREFIX) ? CHILD_BLOCK_PATTERN : id;

  return HOME_BLOCK_BOUNDS[key];
}
