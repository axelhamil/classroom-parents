import type { BlockSize, GridColumns } from "./block-size";

/** A block to place, in the order the layout reads it. */
export interface PackEntry {
  id: string;
  size: BlockSize;
}

/** A block placed on the columns of cards, maybe larger than its size where it closes a hole. */
export interface Placed {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One tile placed on the grid columns, the shape a grid library positions. */
export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Cell {
  x: number;
  y: number;
}

interface Rect extends Cell {
  w: number;
  h: number;
}

interface Block extends Rect {
  id: string;
}

/**
 * Lays blocks out as free rectangles on `columns` columns of cards, in the order given: each block
 * takes the first place, read row by row from where the block before it stands, that it fits in.
 * A place it skips is a hole: the next blocks that fit are pulled into it, and when none does, the
 * block on its left grows right or the block above it grows down. A width is held to the columns.
 * Positions depend only on the order, the sizes and the columns, never on what the blocks show.
 */
export function pack(blocks: readonly PackEntry[], columns: GridColumns): Placed[] {
  const entries = blocks.map(({ id, size }) => ({
    id,
    size: { ...size, w: Math.min(size.w, columns) },
  }));

  return new FreePacker(columns, entries).run();
}

/** Converts placed blocks to the items a grid library positions, one column of cards per column. */
export function toGrid(items: readonly Placed[]): GridItem[] {
  return items.map(({ id, x, y, w, h }) => ({ i: id, x, y, w, h }));
}

class FreePacker {
  private readonly sheet: Sheet;
  private queue: PackEntry[];
  private cursor: Cell = { x: 0, y: 0 };

  constructor(columns: GridColumns, entries: readonly PackEntry[]) {
    this.sheet = new Sheet(columns);
    this.queue = [...entries];
  }

  run(): Placed[] {
    for (let head = this.queue.shift(); head; head = this.queue.shift()) this.take(head);

    return this.sheet.blocks.map(toPlaced).sort((a, b) => a.y - b.y || a.x - b.x);
  }

  private take(head: PackEntry): void {
    const slot = this.slotFor(head.size);

    this.fillHoles(slot);
    this.sheet.add(head, slot);
    this.cursor = slot;
  }

  /** The first place from the cursor where the block fits and every hole it leaves can be closed. */
  private slotFor(size: BlockSize): Rect {
    const bottom = this.sheet.bottom();

    for (let y = this.cursor.y; y < bottom; y++)
      for (let x = y === this.cursor.y ? this.cursor.x : 0; x + size.w <= this.sheet.columns; x++) {
        const slot = { x, y, ...size };

        if (this.sheet.fits(slot) && this.sheet.copy().closeHoles(this.cursor, slot)) return slot;
      }

    return { x: 0, y: bottom, ...size };
  }

  private fillHoles(slot: Rect): void {
    for (
      let hole = this.sheet.firstHole(this.cursor, slot);
      hole;
      hole = this.sheet.firstHole(this.cursor, slot)
    ) {
      const closed = this.pullInto(hole, slot) || this.sheet.grow(hole, slot);
      if (!closed) return;
    }
  }

  private pullInto(hole: Cell, slot: Rect): boolean {
    const entry = this.queue.find((candidate) => this.canPull(candidate, hole, slot));
    if (!entry) return false;

    this.queue = this.queue.filter((candidate) => candidate !== entry);
    this.sheet.add(entry, hole);

    return true;
  }

  private canPull(entry: PackEntry, hole: Cell, slot: Rect): boolean {
    const rect = { ...hole, ...entry.size };
    if (!this.sheet.fits(rect) || overlaps(rect, slot)) return false;

    const trial = this.sheet.copy();
    trial.add(entry, hole);

    return trial.closeHoles(this.cursor, slot);
  }
}

/** The cases taken so far, read and grown while the blocks are placed. */
class Sheet {
  constructor(
    readonly columns: number,
    readonly blocks: Block[] = [],
  ) {}

  copy(): Sheet {
    return new Sheet(
      this.columns,
      this.blocks.map((block) => ({ ...block })),
    );
  }

  add({ id, size }: PackEntry, { x, y }: Cell): void {
    this.blocks.push({ id, x, y, w: size.w, h: size.h });
  }

  bottom(): number {
    return Math.max(0, ...this.blocks.map(({ y, h }) => y + h));
  }

  fits(rect: Rect): boolean {
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > this.columns) return false;

    return !this.blocks.some((block) => overlaps(block, rect));
  }

  /** The first free case read from `from` up to, not including, the place `slot` starts at. */
  firstHole(from: Cell, slot: Cell): Cell | undefined {
    for (let y = from.y; y <= slot.y; y++)
      for (let x = y === from.y ? from.x : 0; x < this.columns; x++) {
        if (y === slot.y && x >= slot.x) return undefined;
        if (this.fits({ x, y, w: 1, h: 1 })) return { x, y };
      }

    return undefined;
  }

  /** Closes every hole before `slot` by growing the blocks around it, false when one cannot be. */
  closeHoles(from: Cell, slot: Rect): boolean {
    for (let hole = this.firstHole(from, slot); hole; hole = this.firstHole(from, slot))
      if (!this.grow(hole, slot)) return false;

    return true;
  }

  /** Covers a hole with the block on its left grown right, else the block above it grown down. */
  grow(hole: Cell, slot: Rect): boolean {
    const left = this.at(hole.x - 1, hole.y);
    if (left?.y === hole.y && this.isClear({ x: hole.x, y: hole.y, w: 1, h: left.h }, slot)) {
      left.w += 1;
      return true;
    }

    const above = this.at(hole.x, hole.y - 1);
    if (above?.x === hole.x && this.isClear({ x: hole.x, y: hole.y, w: above.w, h: 1 }, slot)) {
      above.h += 1;
      return true;
    }

    return false;
  }

  private isClear(rect: Rect, slot: Rect): boolean {
    return this.fits(rect) && !overlaps(rect, slot);
  }

  private at(x: number, y: number): Block | undefined {
    return this.blocks.find((block) => overlaps(block, { x, y, w: 1, h: 1 }));
  }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function toPlaced({ id, x, y, w, h }: Block): Placed {
  return { id, x, y, w, h };
}
