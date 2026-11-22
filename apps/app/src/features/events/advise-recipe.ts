import { type BlockSize, type GridColumns, heldOnGrid } from "../../shared/dashboard/block-size";
import type { AdviceContext } from "./advise-context";
import { boundsOf, CHILD_BLOCK_PREFIX, ONE_CASE, ONE_ROW, TWO_ROWS } from "./home-block-bounds";

/** A block as the advice places it, in cases of the grid at the column count it composes for. */
export interface RecipeBlock {
  id: string;
  size: BlockSize;
}

/**
 * A block the advice may place around its hero, at the size the recipe asks at this column count.
 * `glance` is the size it gives way to when its row needs room, `null` when it cannot shrink;
 * `minCases` the fewest cases it may be drawn on, so a block to act on never hides its action.
 */
export interface Secondary {
  id: string;
  size: BlockSize;
  recipeSize: BlockSize;
  glance: BlockSize | null;
  minCases: number;
  empty: boolean;
}

export interface Recipe {
  hero: RecipeBlock;
  secondaries: readonly Secondary[];
  fillers: readonly Secondary[];
}

const AGENDA_ROWS = 2;

/** Blocks whose glance hides what the parent does there: confirming a date, reaching late homework. */
const ACTION_BLOCK_IDS: ReadonlySet<string> = new Set(["review", "overdue"]);

const ACTION_MIN_CASES = 2;

const BUSY_NEIGHBOURS = ["workload", "assessments"];

const FILLER_IDS: readonly [string, BlockSize][] = [
  ["notes", ONE_ROW],
  ["progress", ONE_CASE],
  ["outings", ONE_CASE],
];

interface Wish {
  id: string;
  size: BlockSize;
}

interface RecipeWish {
  hero: Wish;
  secondaries: readonly Wish[];
  fills: boolean;
}

/** The Agenda over the whole row of cards, at the height its bounds ask at this column count. */
export function agendaAt(columns: GridColumns): RecipeBlock {
  return onGrid({ id: "calendar", size: { w: columns, h: AGENDA_ROWS } }, columns);
}

/** A block of the recipe held within its bounds at this column count. */
export function onGrid({ id, size }: Wish, columns: GridColumns): RecipeBlock {
  return { id, size: heldOnGrid(size, boundsOf(id), columns) };
}

export function adviceRecipe(
  context: AdviceContext,
  columns: GridColumns,
  emptyBlocks: ReadonlySet<string>,
): Recipe {
  const { hero, secondaries, fills } = recipeFor(context, columns);
  const placeable = (wish: Wish) => secondaryOf(wish, columns, emptyBlocks);

  return {
    hero: onGrid(hero, columns),
    secondaries: secondaries.flatMap(placeable),
    fillers: fills ? FILLER_IDS.flatMap(([id, size]) => placeable({ id, size })) : [],
  };
}

function recipeFor(context: AdviceContext, columns: GridColumns): RecipeWish {
  if (context.data === "welcome") return welcome();
  if (context.holiday === "during") return holiday(columns);
  if (context.holiday === "eve") return evening(context);
  if (context.moment === "morning") return morning(context);
  if (context.moment === "evening") return evening(context);

  return week(context, columns);
}

function welcome(): RecipeWish {
  return { hero: { id: "welcome", size: TWO_ROWS }, secondaries: [large("notes")], fills: false };
}

function holiday(columns: GridColumns): RecipeWish {
  const secondaries = [large("overdue"), medium("documents"), medium("notes"), medium("outings")];

  return { hero: agendaAt(columns), secondaries, fills: true };
}

function morning(context: AdviceContext): RecipeWish {
  const usual = ["review", "overdue"];
  const then = ["documents", "assessments", "notes"];

  return besideHero("today", context, usual, then);
}

function evening(context: AdviceContext): RecipeWish {
  const usual = ["assessments", "documents"];
  const then = ["review", "overdue", "notes"];

  return besideHero("tonight", context, usual, then);
}

function besideHero(
  heroId: string,
  context: AdviceContext,
  usual: string[],
  then: string[],
): RecipeWish {
  const neighbours = context.data === "busy" ? BUSY_NEIGHBOURS : usual;
  const ids = new Set([...neighbours, ...usual, ...then]);

  return { hero: large(heroId), secondaries: [...ids].map(medium), fills: true };
}

function week(context: AdviceContext, columns: GridColumns): RecipeWish {
  const ids = new Set([...rowTwoOf(context), "documents", "review", "notes"]);
  const secondaries = [large("workload"), ...[...ids].map(medium)];

  return { hero: agendaAt(columns), secondaries, fills: true };
}

function rowTwoOf(context: AdviceContext): string[] {
  if (context.children !== "2-3") return ["assessments", "outings"];

  const children = context.childIds.map((id) => `${CHILD_BLOCK_PREFIX}${id}`);

  return children.length % 2 === 0 ? children : [...children, "notes"];
}

function medium(id: string): Wish {
  return { id, size: ONE_ROW };
}

function large(id: string): Wish {
  return { id, size: TWO_ROWS };
}

/**
 * A wished block as the advice may place it: an empty one at its glance, or left out when it has
 * none; a block to act on that has something to show never at a glance, at any width.
 */
function secondaryOf(
  wish: Wish,
  columns: GridColumns,
  emptyBlocks: ReadonlySet<string>,
): Secondary[] {
  const { id } = wish;
  const glance = glanceOf(id, columns);
  const empty = emptyBlocks.has(id);
  const recipeSize = onGrid(wish, columns).size;
  if (empty) return glance ? [{ id, size: glance, recipeSize, glance, minCases: 1, empty }] : [];

  if (!ACTION_BLOCK_IDS.has(id))
    return [{ id, size: recipeSize, recipeSize, glance, minCases: 1, empty }];

  const size = onCasesAtLeast({ id, size: recipeSize }, ACTION_MIN_CASES, columns);

  return [{ id, size, recipeSize: size, glance: null, minCases: ACTION_MIN_CASES, empty }];
}

/** A block made taller until it covers at least `cases` cases, as far as its bounds allow. */
function onCasesAtLeast({ id, size }: Wish, cases: number, columns: GridColumns): BlockSize {
  if (size.w * size.h >= cases) return size;

  return onGrid({ id, size: { w: size.w, h: Math.ceil(cases / size.w) } }, columns).size;
}

/** The glance a block may give way to at this column count, `null` when its bounds forbid one. */
function glanceOf(id: string, columns: GridColumns): BlockSize | null {
  const sizing = boundsOf(id);
  if (!sizing) return null;

  const held = heldOnGrid(ONE_CASE, sizing, columns);

  return held.w === ONE_CASE.w && held.h === ONE_CASE.h ? ONE_CASE : null;
}
