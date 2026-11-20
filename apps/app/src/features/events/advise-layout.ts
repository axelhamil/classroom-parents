import type { GridUnits } from "../../shared/dashboard/dashboard-pack";
import type { LayoutBlock } from "../../shared/dashboard/layout-migration";
import type { AdviceContext } from "./advise-context";
import { adviceRecipe, CALENDAR, type CellSize, type Secondary } from "./advise-recipe";
import { allowsSize } from "./home-block-sizes";

export interface LayoutAdvice {
  heroId: string;
  blocks: LayoutBlock[];
}

interface CellRule {
  units: GridUnits;
  besideHero: boolean;
}

type Cell = readonly Secondary[];

const QUARTERS: Record<CellSize, number> = { s: 1, m: 2, l: 4 };

const CELL_QUARTERS = 4;

const PHONE_UNITS = 2;

const FILLERS: readonly Secondary[] = [
  { id: "notes", size: "m", recipeSize: "m", empty: false },
  { id: "progress", size: "s", recipeSize: "s", empty: false },
  { id: "outings", size: "s", recipeSize: "s", empty: false },
];

export function adviseLayout(
  context: AdviceContext,
  units: GridUnits,
  emptyBlocks: ReadonlySet<string>,
): LayoutAdvice {
  const { hero, secondaries } = adviceRecipe(context, emptyBlocks);
  const rule = { units, besideHero: hero.size !== "xl" && units !== PHONE_UNITS };
  const cells = toCells(fitRows(secondaries, rule));

  return { heroId: hero.id, blocks: arrange(hero, cells) };
}

function fitRows(blocks: readonly Secondary[], rule: CellRule): Secondary[] {
  const fitted = fitWithoutRemoval(blocks, rule) ?? fitByRemovingOne(blocks, rule);
  if (fitted || blocks.length === 0) return fitted ?? [];

  return fitRows(without(blocks, removalOrder(blocks)[0]), rule);
}

function fitWithoutRemoval(blocks: readonly Secondary[], rule: CellRule): Secondary[] | null {
  return fitByShrinking(blocks, rule) ?? fitByKeepingEmpties(blocks, rule);
}

function fitByShrinking(blocks: readonly Secondary[], rule: CellRule): Secondary[] | null {
  const shrinkable = [...blocks].reverse().filter(canShrink);

  for (let count = 0; count <= shrinkable.length; count++) {
    const shrunk = new Set(shrinkable.slice(0, count));
    const sized = blocks.map((block) => (shrunk.has(block) ? asGlance(block) : block));
    const completed = completeWithFillers(sized, rule);
    if (completed) return completed;
  }

  return null;
}

function asGlance(block: Secondary): Secondary {
  return { ...block, size: "s" };
}

function canShrink(block: Secondary): boolean {
  return block.size !== "s" && allowsSize(block.id, "s");
}

function fitByKeepingEmpties(blocks: readonly Secondary[], rule: CellRule): Secondary[] | null {
  const keepable = [...blocks]
    .reverse()
    .filter(({ empty, size, recipeSize }) => empty && size !== recipeSize);

  for (let count = 1; count <= keepable.length; count++)
    for (const kept of combinations(keepable, count)) {
      const sized = blocks.map((block) => (kept.includes(block) ? atRecipeSize(block) : block));
      const completed = completeWithFillers(sized, rule);
      if (completed) return completed;
    }

  return null;
}

function combinations<T>(items: readonly T[], count: number): T[][] {
  if (count === 0) return [[]];

  return items.flatMap((item, index) =>
    combinations(items.slice(index + 1), count - 1).map((rest) => [item, ...rest]),
  );
}

function atRecipeSize(block: Secondary): Secondary {
  return { ...block, size: block.recipeSize };
}

function fitByRemovingOne(blocks: readonly Secondary[], rule: CellRule): Secondary[] | null {
  for (const removed of removalOrder(blocks)) {
    const fitted = fitWithoutRemoval(without(blocks, removed), rule);
    if (fitted) return fitted;
  }

  return null;
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

function completeWithFillers(blocks: readonly Secondary[], rule: CellRule): Secondary[] | null {
  const missing = quartersMissing(quartersOf(blocks), rule);
  const completed = [...blocks, ...fillersFor(blocks, missing)];

  return quartersMissing(quartersOf(completed), rule) === 0 ? completed : null;
}

function fillersFor(blocks: readonly Secondary[], missing: number): Secondary[] {
  const taken = new Set(blocks.map(({ id }) => id));
  const picked: Secondary[] = [];
  let left = missing;

  for (const filler of FILLERS) {
    if (taken.has(filler.id) || QUARTERS[filler.size] > left) continue;

    picked.push(filler);
    left -= QUARTERS[filler.size];
  }

  return picked;
}

function quartersOf(blocks: readonly Secondary[]): number {
  return blocks.reduce((total, { size }) => total + QUARTERS[size], 0);
}

function quartersMissing(quarters: number, rule: CellRule): number {
  let target = Math.ceil(quarters / CELL_QUARTERS) * CELL_QUARTERS;

  while (!fillsRows(target / CELL_QUARTERS, rule)) target += CELL_QUARTERS;

  return target - quarters;
}

function fillsRows(cells: number, rule: CellRule): boolean {
  if (rule.units === PHONE_UNITS) return true;

  const cellsUnderHero = rule.besideHero ? cells - 1 : cells;

  return cellsUnderHero >= 0 && cellsUnderHero % 2 === 0;
}

function toCells(blocks: readonly Secondary[]): Cell[] {
  const { whole, half } = pairLists(blocks.filter(({ size }) => size !== "s"));
  const glances = blocks.filter(({ size }) => size === "s");

  if (!half) return [...whole, ...chunksOf(glances)];

  return [...whole, [half, ...glances.slice(0, 2)], ...chunksOf(glances.slice(2))];
}

function pairLists(blocks: readonly Secondary[]): { whole: Cell[]; half?: Secondary } {
  return blocks.reduce<{ whole: Cell[]; half?: Secondary }>(
    ({ whole, half }, block) => {
      if (block.size === "l") return { whole: [...whole, [block]], half };
      if (half) return { whole: [...whole, [half, block]] };

      return { whole, half: block };
    },
    { whole: [] },
  );
}

function chunksOf(glances: readonly Secondary[]): Cell[] {
  return Array.from({ length: Math.ceil(glances.length / CELL_QUARTERS) }, (_, index) =>
    glances.slice(index * CELL_QUARTERS, (index + 1) * CELL_QUARTERS),
  );
}

function arrange(hero: LayoutBlock, cells: readonly Cell[]): LayoutBlock[] {
  const [neighbour = [], ...under] = cells.map((cell) =>
    cell.map(({ id, size }) => ({ id, size })),
  );

  if (hero.size === "xl") return [hero, ...neighbour, ...under.flat()];

  return [hero, ...neighbour, CALENDAR, ...under.flat()];
}
