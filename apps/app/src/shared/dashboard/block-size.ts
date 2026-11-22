/** Columns of cards across the home: 1 on a phone, 2 on a tablet, 3 from 1280 px, 4 from 1600 px. */
export type GridColumns = 1 | 2 | 3 | 4;

/** A block's size in cases of the home grid: `w` card columns wide, `h` rows high. */
export interface BlockSize {
  w: number;
  h: number;
}

/** The smallest and largest size a block can be drawn at, in cases, as its content allows. */
export interface Bounds {
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
}

/**
 * A minimum a block raises at one column count, for content that needs more room there: more rows
 * where rows are short, or two columns where a column is too narrow for it on one row.
 */
export interface RaisedMinimum {
  columns: GridColumns;
  minW?: number;
  minH?: number;
}

/**
 * How a block may be sized: its bounds, the size it takes when shown, and the minimums it raises
 * at some column counts.
 */
export interface BlockSizing {
  bounds: Bounds;
  defaultSize: BlockSize;
  raisedAt?: readonly RaisedMinimum[];
}

/** The bounds of a block at a column count, its minimums raised where it asks for more room. */
export function boundsAt({ bounds, raisedAt }: BlockSizing, columns: GridColumns): Bounds {
  const raised = raisedAt?.find((minimum) => minimum.columns === columns);
  if (!raised) return bounds;

  return {
    ...bounds,
    minW: Math.max(bounds.minW, raised.minW ?? bounds.minW),
    minH: Math.max(bounds.minH, raised.minH ?? bounds.minH),
  };
}

/** A size held within bounds, each side on its own. */
export function holdWithin(size: BlockSize, bounds: Bounds): BlockSize {
  return { w: clamp(size.w, bounds.minW, bounds.maxW), h: clamp(size.h, bounds.minH, bounds.maxH) };
}

/**
 * Where a block of a stored size is drawn at a column count: held within its bounds there and the
 * columns of the grid. A block wider than the grid keeps its surface in height, up to its tallest,
 * so a list never shrinks to a glance on a narrower screen. The stored size is left as it is, so a
 * wider screen draws it whole again.
 */
export function sizeAt(
  size: BlockSize,
  sizing: BlockSizing | undefined,
  columns: GridColumns,
): BlockSize {
  const drawn = heldOnGrid(size, sizing, columns);
  if (!sizing || size.w <= drawn.w) return drawn;

  const whole = holdWithin(size, boundsAt(sizing, columns));
  const surfaceRows = Math.ceil((whole.w * whole.h) / drawn.w);

  return { ...drawn, h: Math.min(sizing.bounds.maxH, Math.max(drawn.h, surfaceRows)) };
}

/**
 * A size written for a column count: held within the block's bounds there and the columns, each
 * side on its own. What a size chosen at this width (a step, a handle, the advice) becomes.
 */
export function heldOnGrid(
  size: BlockSize,
  sizing: BlockSizing | undefined,
  columns: GridColumns,
): BlockSize {
  if (!sizing) return { ...size, w: Math.min(size.w, columns) };

  return holdWithin(size, boundsOnGrid(sizing, columns));
}

/** The bounds a block is drawn and resized within at a column count, its width held to the columns. */
export function boundsOnGrid(sizing: BlockSizing, columns: GridColumns): Bounds {
  const bounds = boundsAt(sizing, columns);

  return { ...bounds, minW: Math.min(bounds.minW, columns), maxW: Math.min(bounds.maxW, columns) };
}

/**
 * The bounds a tile is resized within on screen. A tile drawn at the height of its content, a block
 * that flows with the page, keeps the height it is drawn at: it has no rows of cases to step.
 */
export function resizeBounds(
  sizing: BlockSizing,
  columns: GridColumns,
  heldHeight?: number,
): Bounds {
  const bounds = boundsOnGrid(sizing, columns);
  if (heldHeight === undefined) return bounds;

  return { ...bounds, minH: heldHeight, maxH: heldHeight };
}

/** A size written `wxh`, to compare sizes or name one on a tile. */
export function sizeKey({ w, h }: BlockSize): string {
  return `${w}x${h}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
