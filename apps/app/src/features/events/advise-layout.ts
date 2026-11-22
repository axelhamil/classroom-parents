import {
  type BlockSize,
  type GridColumns,
  heldOnGrid,
  sizeKey,
} from "../../shared/dashboard/block-size";
import type { AdviceContext } from "./advise-context";
import { adviceRecipe, agendaAt, onGrid, type RecipeBlock, type Secondary } from "./advise-recipe";
import { boundsOf } from "./home-block-bounds";

export interface LayoutAdvice {
  heroId: string;
  blocks: RecipeBlock[];
}

/**
 * The room the secondaries fill: `band`, the cell beside the hero (or under it when the hero takes
 * the whole row), then the rows under the Agenda. A band beside the hero must be filled whole.
 */
interface Page {
  columns: GridColumns;
  hero: RecipeBlock;
  agenda: RecipeBlock[];
  band: Area | null;
}

interface Area {
  width: number;
  height: number;
  beside: boolean;
}

interface Composed {
  band: RecipeBlock[];
  under: RecipeBlock[];
}

interface Cell {
  x: number;
  y: number;
}

const NOTHING_BESIDE: Composed = { band: [], under: [] };

export function adviseLayout(
  context: AdviceContext,
  columns: GridColumns,
  emptyBlocks: ReadonlySet<string>,
): LayoutAdvice {
  const { hero, secondaries, fillers } = adviceRecipe(context, columns, emptyBlocks);
  const fitOn = (page: Page) => new Fitter(page, fillers).fit(secondaries);
  const page = pageOf(hero, columns);
  const composed = fitOn(page);
  if (composed) return adviceOn(page, composed);

  const wide = pageOf(widened(hero, columns), columns);

  return adviceOn(wide, fitOn(wide) ?? NOTHING_BESIDE);
}

function adviceOn({ hero, agenda }: Page, { band, under }: Composed): LayoutAdvice {
  return { heroId: hero.id, blocks: [hero, ...band, ...agenda, ...under] };
}

function pageOf(hero: RecipeBlock, columns: GridColumns): Page {
  const agenda = agendaAt(columns);
  if (hero.id === agenda.id) return { columns, hero, agenda: [], band: null };

  const room = columns - hero.size.w;
  const band =
    room > 0
      ? { width: room, height: hero.size.h, beside: true }
      : { width: columns, height: hero.size.h, beside: false };

  return { columns, hero, agenda: [agenda], band };
}

/** The hero over the whole row, as far as its bounds let it: for when nothing can stand beside it. */
function widened(hero: RecipeBlock, columns: GridColumns): RecipeBlock {
  return onGrid({ id: hero.id, size: { ...hero.size, w: columns } }, columns);
}

/**
 * Fits the secondaries of a recipe in a page without a hole: first by shrinking the lowest to
 * their glance, then by keeping empty blocks at their recipe size, then by leaving out the lowest,
 * each try completed with fillers when the last row needs them.
 */
class Fitter {
  constructor(
    private readonly page: Page,
    private readonly fillers: readonly Secondary[],
  ) {}

  fit(blocks: readonly Secondary[]): Composed | null {
    const fitted = this.withoutRemoval(blocks) ?? this.byRemovingOne(blocks);
    if (fitted || blocks.length === 0) return fitted;

    return this.fit(without(blocks, removalOrder(blocks)[0]));
  }

  private withoutRemoval(blocks: readonly Secondary[]): Composed | null {
    return this.byShrinking(blocks) ?? this.byKeepingEmpties(blocks);
  }

  private byShrinking(blocks: readonly Secondary[]): Composed | null {
    const shrinkable = [...blocks].reverse().filter(canShrink);

    for (let count = 0; count <= shrinkable.length; count++) {
      const shrunk = new Set(shrinkable.slice(0, count));
      const sized = blocks.map((block) => (shrunk.has(block) ? asGlance(block) : block));
      const completed = this.withFillers(sized);
      if (completed) return completed;
    }

    return null;
  }

  private byKeepingEmpties(blocks: readonly Secondary[]): Composed | null {
    const keepable = [...blocks]
      .reverse()
      .filter(({ empty, size, recipeSize }) => empty && sizeKey(size) !== sizeKey(recipeSize));

    for (let count = 1; count <= keepable.length; count++)
      for (const kept of combinations(keepable, count)) {
        const sized = blocks.map((block) => (kept.includes(block) ? atRecipeSize(block) : block));
        const completed = this.withFillers(sized);
        if (completed) return completed;
      }

    return null;
  }

  private byRemovingOne(blocks: readonly Secondary[]): Composed | null {
    for (const removed of removalOrder(blocks)) {
      const fitted = this.withoutRemoval(without(blocks, removed));
      if (fitted) return fitted;
    }

    return null;
  }

  private withFillers(blocks: readonly Secondary[]): Composed | null {
    const taken = new Set(blocks.map(({ id }) => id));
    const free = this.fillers.filter(({ id }) => !taken.has(id));

    for (let count = 0; count <= free.length; count++)
      for (const added of combinations(free, count)) {
        const composed = compose(this.page, [...blocks, ...added]);
        if (composed) return composed;
      }

    return null;
  }
}

function canShrink({ size, glance }: Secondary): boolean {
  return glance !== null && sizeKey(size) !== sizeKey(glance);
}

function asGlance(block: Secondary): Secondary {
  return block.glance ? { ...block, size: block.glance } : block;
}

function atRecipeSize(block: Secondary): Secondary {
  return { ...block, size: block.recipeSize };
}

function combinations<T>(items: readonly T[], count: number): T[][] {
  if (count === 0) return [[]];

  return items.flatMap((item, index) =>
    combinations(items.slice(index + 1), count - 1).map((rest) => [item, ...rest]),
  );
}

function removalOrder(blocks: readonly Secondary[]): Secondary[] {
  const lowestFirst = [...blocks].reverse();

  return [
    ...lowestFirst.filter(({ empty }) => empty),
    ...lowestFirst.filter(({ empty }) => !empty),
  ];
}

function without(blocks: readonly Secondary[], removed: Secondary | undefined): Secondary[] {
  return blocks.filter((block) => block !== removed);
}

/**
 * Lays the blocks in the band, then under the Agenda, each case read row by row taking the widest
 * block that fits there, the first by priority among equals, or a block narrowed to the room left.
 * Null when a band beside the hero is left open or the last row under the Agenda is not full.
 */
function compose({ band, columns }: Page, blocks: readonly Secondary[]): Composed | null {
  const banded = band ? fillArea(band, blocks, columns) : { placed: [], rest: blocks };
  if (!banded) return null;

  const under = fillArea(
    { width: columns, height: Number.POSITIVE_INFINITY, beside: false },
    banded.rest,
    columns,
  );
  if (!under || under.rest.length > 0) return null;

  return { band: banded.placed, under: under.placed };
}

interface Filled {
  placed: RecipeBlock[];
  rest: readonly Secondary[];
}

function fillArea(area: Area, blocks: readonly Secondary[], columns: GridColumns): Filled | null {
  const sheet = new AreaSheet(area);
  let rest = blocks;
  const placed: RecipeBlock[] = [];

  for (let cell = sheet.firstFree(rest.length > 0); cell; cell = sheet.firstFree(rest.length > 0)) {
    const pick = pickAt(sheet, cell, rest, columns);
    if (!pick) return sheet.isEmpty() && !area.beside ? { placed, rest } : null;

    sheet.take(cell, pick.size);
    placed.push({ id: pick.block.id, size: pick.size });
    rest = rest.filter((block) => block !== pick.block);
  }

  return sheet.isClosed() ? { placed, rest } : null;
}

interface Pick {
  block: Secondary;
  size: BlockSize;
}

function pickAt(
  sheet: AreaSheet,
  cell: Cell,
  blocks: readonly Secondary[],
  columns: GridColumns,
): Pick | undefined {
  const fitting = blocks.filter(({ size }) => sheet.fits(cell, size));
  const widest = Math.max(0, ...fitting.map(({ size }) => size.w));
  const native = fitting.find(({ size }) => size.w === widest);
  if (native) return { block: native, size: native.size };

  const run = sheet.runAt(cell);

  for (const block of blocks)
    for (const size of narrowings(block, run, columns))
      if (sheet.fits(cell, size)) return { block, size };

  return undefined;
}

/**
 * The sizes a block may take on a narrower run of cases, tallest first: from the room it had down
 * to the fewest cases it may be drawn on, each within its bounds.
 */
function narrowings(
  { id, size, minCases }: Secondary,
  run: number,
  columns: GridColumns,
): BlockSize[] {
  if (size.w <= run) return [];

  const tallest = Math.ceil((size.w * size.h) / run);
  const lowest = Math.ceil(minCases / run);

  return Array.from({ length: Math.max(0, tallest - lowest + 1) }, (_, step) => ({
    w: run,
    h: tallest - step,
  })).filter((wanted) => sizeKey(heldOnGrid(wanted, boundsOf(id), columns)) === sizeKey(wanted));
}

/** The cases of an area taken so far, an area with no height growing as rows are taken. */
class AreaSheet {
  private readonly rows: boolean[][] = [];

  constructor(private readonly area: Area) {}

  /** The first free case, read row by row; on an open area, the start of a new row once all are full. */
  firstFree(more: boolean): Cell | undefined {
    const rows = Number.isFinite(this.area.height) ? this.area.height : this.rows.length;

    for (let y = 0; y < rows; y++)
      for (let x = 0; x < this.area.width; x++) if (!this.taken(x, y)) return { x, y };

    return more && !Number.isFinite(this.area.height) ? { x: 0, y: rows } : undefined;
  }

  fits({ x, y }: Cell, { w, h }: BlockSize): boolean {
    if (x + w > this.area.width || y + h > this.area.height) return false;

    for (let row = y; row < y + h; row++)
      for (let column = x; column < x + w; column++) if (this.taken(column, row)) return false;

    return true;
  }

  runAt({ x, y }: Cell): number {
    let run = 0;
    while (x + run < this.area.width && !this.taken(x + run, y)) run++;

    return run;
  }

  take({ x, y }: Cell, { w, h }: BlockSize): void {
    for (let row = y; row < y + h; row++) {
      const cases = this.rows[row] ?? Array.from({ length: this.area.width }, () => false);
      for (let column = x; column < x + w; column++) cases[column] = true;
      this.rows[row] = cases;
    }
  }

  isEmpty(): boolean {
    return this.rows.length === 0;
  }

  /** Whether every case of the rows taken is covered, and a band of fixed height whole or untouched. */
  isClosed(): boolean {
    const full = this.rows.every((row) => row?.every(Boolean));
    if (!Number.isFinite(this.area.height)) return full;

    return this.isEmpty() ? !this.area.beside : full && this.rows.length === this.area.height;
  }

  private taken(x: number, y: number): boolean {
    return this.rows[y]?.[x] ?? false;
  }
}
