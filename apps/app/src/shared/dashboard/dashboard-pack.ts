export const BLOCK_SIZES = ["s", "m", "l", "xl"] as const;

export type BlockSize = (typeof BLOCK_SIZES)[number];

/** Width of the home grid in units: 2 on a phone, 4 from a tablet up. */
export type GridUnits = 2 | 4;

export interface PackedItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  grown: boolean;
  pulled: boolean;
}

export interface PackedLayout {
  items: PackedItem[];
}

/** One tile placed on the grid columns, the shape a grid library positions. */
export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Span {
  w: number;
  h: number;
}

interface Entry {
  id: string;
  size: BlockSize;
}

interface Placement {
  id: string;
  size: BlockSize;
  cell: number;
  dx: number;
  dy: number;
  w: number;
  h: number;
  pulled: boolean;
}

const SPANS: Record<BlockSize, Span> = {
  s: { w: 1, h: 1 },
  m: { w: 2, h: 1 },
  l: { w: 2, h: 2 },
  xl: { w: 4, h: 2 },
};

const CELL_SIDE = 2;

const QUARTERS = CELL_SIDE * CELL_SIDE;

const QUARTERS_TAKEN: Record<BlockSize, number> = { s: 1, m: 2, l: 4, xl: 4 };

const PHONE_UNITS = 2;

const PHONE_COLUMNS = 4;

function spanOf(size: BlockSize, units: GridUnits): Span {
  if (size === "xl" && units === PHONE_UNITS) return SPANS.l;

  return SPANS[size];
}

function fitsAt(size: BlockSize, fill: number): boolean {
  if (size === "s") return fill < QUARTERS;
  if (size === "m") return fill === 0 || fill === CELL_SIDE;

  return fill === 0;
}

function quarterOffset(quarter: number): { dx: number; dy: number } {
  return { dx: quarter % CELL_SIDE, dy: Math.floor(quarter / CELL_SIDE) };
}

function emptyQuarters(placements: readonly Placement[]): Set<number> {
  const empty = new Set([0, 1, 2, 3]);

  for (const { dx, dy, w, h } of placements)
    for (let row = dy; row < dy + h; row++)
      for (let col = dx; col < dx + w; col++) empty.delete(row * CELL_SIDE + col);

  return empty;
}

function growDown(placements: Placement[]): void {
  for (const placement of placements) {
    if (placement.dy !== 0 || placement.h !== 1) continue;

    const empty = emptyQuarters(placements);
    const below = Array.from({ length: placement.w }, (_, col) => CELL_SIDE + placement.dx + col);
    if (below.every((quarter) => empty.has(quarter))) placement.h = CELL_SIDE;
  }
}

function growLastRight(placements: Placement[]): void {
  const last = placements.at(-1);
  if (!last || emptyQuarters(placements).size === 0) return;

  last.w = CELL_SIDE;
}

/**
 * Lays blocks out by cells of 2 x 2 units: a cell takes one L, two M, four S or
 * a mix read top left to bottom right, and an XL takes a whole row of cells.
 * A cell left incomplete first pulls the next block that fits, then grows its
 * own blocks so no row keeps a hole. Positions depend only on the order, the
 * sizes and the width, never on what the blocks show.
 */
export function pack(
  order: readonly string[],
  sizeOf: (id: string) => BlockSize,
  units: GridUnits,
): PackedLayout {
  const entries = order.map((id) => ({ id, size: sizeOf(id) }));

  return { items: new CellPacker(units).run(entries) };
}

class CellPacker {
  private readonly cellsPerRow: number;
  private readonly placements: Placement[] = [];
  private queue: Entry[] = [];
  private cell = 0;

  constructor(private readonly units: GridUnits) {
    this.cellsPerRow = units / CELL_SIDE;
  }

  run(entries: readonly Entry[]): PackedItem[] {
    this.queue = [...entries];

    for (let entry = this.queue.shift(); entry; entry = this.queue.shift()) this.take(entry);

    this.closeRow();

    return this.toItems();
  }

  private take(entry: Entry): void {
    if (this.spansRow(entry.size)) {
      this.placeRow(entry);
      return;
    }

    if (!fitsAt(entry.size, this.fill(this.cell))) {
      this.closeCell();
      this.cell++;
    }

    this.place(entry, this.cell, false);
    if (this.fill(this.cell) === QUARTERS) this.cell++;
  }

  private spansRow(size: BlockSize): boolean {
    return size === "xl" && this.units !== PHONE_UNITS;
  }

  private placeRow(entry: Entry): void {
    this.closeRow();
    this.cell = this.rowStart(this.cell) + (this.isRowStart(this.cell) ? 0 : this.cellsPerRow);

    this.place(entry, this.cell, false);
    this.cell += this.cellsPerRow;
  }

  private closeRow(): void {
    if (this.isRowStart(this.cell) && this.fill(this.cell) === 0) return;

    this.closeCell();
    if (this.cellsPerRow === 1) return;

    if (this.isRowStart(this.cell)) this.cell++;

    this.fillEmptyRightCell();
  }

  private fillEmptyRightCell(): void {
    if (this.fill(this.cell) > 0) return;

    this.pullInto(this.cell);

    if (this.fill(this.cell) > 0) this.growCell(this.cell);
    else this.doubleWidth(this.cell - 1);
  }

  private closeCell(): void {
    const fill = this.fill(this.cell);
    if (fill === 0 || fill === QUARTERS) return;

    this.pullInto(this.cell);
    this.growCell(this.cell);
  }

  private pullInto(cell: number): void {
    for (let next = this.nextFitting(cell); next; next = this.nextFitting(cell)) {
      this.queue = this.queue.filter((entry) => entry !== next);
      this.place(next, cell, true);
    }
  }

  private nextFitting(cell: number): Entry | undefined {
    const fill = this.fill(cell);
    if (fill === QUARTERS) return undefined;

    return this.queue.find((entry) => !this.spansRow(entry.size) && fitsAt(entry.size, fill));
  }

  private place(entry: Entry, cell: number, pulled: boolean): void {
    const span = spanOf(entry.size, this.units);
    const offset = quarterOffset(this.fill(cell));

    this.placements.push({ ...entry, ...span, ...offset, cell, pulled });
  }

  private growCell(cell: number): void {
    const placements = this.inCell(cell);

    growDown(placements);
    growLastRight(placements);
  }

  private doubleWidth(cell: number): void {
    for (const placement of this.inCell(cell)) {
      placement.dx *= CELL_SIDE;
      placement.w *= CELL_SIDE;
    }
  }

  private fill(cell: number): number {
    return this.inCell(cell).reduce((taken, { size }) => taken + QUARTERS_TAKEN[size], 0);
  }

  private inCell(cell: number): Placement[] {
    return this.placements.filter((placement) => placement.cell === cell);
  }

  private isRowStart(cell: number): boolean {
    return cell % this.cellsPerRow === 0;
  }

  private rowStart(cell: number): number {
    return cell - (cell % this.cellsPerRow);
  }

  private toItems(): PackedItem[] {
    return [...this.placements]
      .sort((a, b) => a.cell - b.cell || a.dy - b.dy || a.dx - b.dx)
      .map((placement) => this.toItem(placement));
  }

  private toItem({ id, size, cell, dx, dy, w, h, pulled }: Placement): PackedItem {
    const span = spanOf(size, this.units);
    const row = Math.floor(cell / this.cellsPerRow);
    const col = cell % this.cellsPerRow;

    return {
      id,
      x: col * CELL_SIDE + dx,
      y: row * CELL_SIDE + dy,
      w,
      h,
      grown: w !== span.w || h !== span.h,
      pulled,
    };
  }
}

/** The grid width in units for a column count: 4 columns is the phone. */
export function unitsFor(cols: number): GridUnits {
  return cols <= PHONE_COLUMNS ? PHONE_UNITS : 4;
}

/** Converts packed units to grid columns; one unit is one row high. */
export function toGrid(items: readonly PackedItem[], cols: number): GridItem[] {
  const columnsPerUnit = cols / unitsFor(cols);

  return items.map(({ id, x, y, w, h }) => ({
    i: id,
    x: x * columnsPerUnit,
    y,
    w: w * columnsPerUnit,
    h,
  }));
}
