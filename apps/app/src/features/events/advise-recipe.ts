import type { BlockSize } from "../../shared/dashboard/dashboard-pack";
import type { LayoutBlock } from "../../shared/dashboard/layout-migration";
import type { AdviceContext } from "./advise-context";
import { allowsSize, CHILD_BLOCK_PREFIX } from "./home-block-sizes";

export type CellSize = Exclude<BlockSize, "xl">;

export interface Secondary {
  id: string;
  size: CellSize;
  recipeSize: CellSize;
  empty: boolean;
}

export interface Recipe {
  hero: LayoutBlock;
  secondaries: readonly Secondary[];
}

export const CALENDAR: LayoutBlock = { id: "calendar", size: "xl" };

const BUSY_NEIGHBOURS = ["workload", "assessments"];

const medium = (id: string): Secondary => ({ id, size: "m", recipeSize: "m", empty: false });

const large = (id: string): Secondary => ({ id, size: "l", recipeSize: "l", empty: false });

const WELCOME: Recipe = {
  hero: { id: "welcome", size: "l" },
  secondaries: [large("notes")],
};

const HOLIDAY: Recipe = {
  hero: CALENDAR,
  secondaries: [large("overdue"), medium("documents"), medium("notes"), medium("outings")],
};

export function adviceRecipe(context: AdviceContext, emptyBlocks: ReadonlySet<string>): Recipe {
  const { hero, secondaries } = recipeFor(context);

  return { hero, secondaries: sizedForContent(secondaries, emptyBlocks) };
}

function recipeFor(context: AdviceContext): Recipe {
  if (context.data === "welcome") return WELCOME;
  if (context.holiday === "during") return HOLIDAY;
  if (context.holiday === "eve") return evening(context);
  if (context.moment === "morning") return morning(context);
  if (context.moment === "evening") return evening(context);

  return week(context);
}

function morning(context: AdviceContext): Recipe {
  const usual = ["review", "overdue"];
  const then = ["documents", "assessments", "notes"];

  return { hero: { id: "today", size: "l" }, secondaries: besideHero(context, usual, then) };
}

function evening(context: AdviceContext): Recipe {
  const usual = ["assessments", "documents"];
  const then = ["review", "overdue", "notes"];

  return { hero: { id: "tonight", size: "l" }, secondaries: besideHero(context, usual, then) };
}

function besideHero(context: AdviceContext, usual: string[], then: string[]): Secondary[] {
  const neighbours = context.data === "busy" ? BUSY_NEIGHBOURS : usual;
  const ids = new Set([...neighbours, ...usual, ...then]);

  return [...ids].map(medium);
}

function week(context: AdviceContext): Recipe {
  const ids = new Set([...rowTwoOf(context), "documents", "review", "notes"]);

  return { hero: CALENDAR, secondaries: [large("workload"), ...[...ids].map(medium)] };
}

function rowTwoOf(context: AdviceContext): string[] {
  if (context.children !== "2-3") return ["assessments", "outings"];

  const children = context.childIds.map((id) => `${CHILD_BLOCK_PREFIX}${id}`);

  return children.length % 2 === 0 ? children : [...children, "notes"];
}

function sizedForContent(
  secondaries: readonly Secondary[],
  emptyBlocks: ReadonlySet<string>,
): Secondary[] {
  return secondaries.flatMap((block): Secondary[] => {
    if (!emptyBlocks.has(block.id)) return [block];

    return allowsSize(block.id, "s") ? [{ ...block, size: "s", empty: true }] : [];
  });
}
