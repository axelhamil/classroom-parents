import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type BlockSize, type GridUnits, pack } from "../../../shared/dashboard/dashboard-pack";
import type { LayoutBlock } from "../../../shared/dashboard/layout-migration";
import {
  type AdviceContext,
  type AdviceMoment,
  childrenCountOf,
  type DataLoad,
  type HolidayPhase,
} from "../advise-context";
import { adviseLayout } from "../advise-layout";
import { adviceRecipe, type CellSize, type Secondary } from "../advise-recipe";
import { allowsSize } from "../home-block-sizes";

const MOMENTS: readonly AdviceMoment[] = ["morning", "evening", "week"];

const DATA: readonly DataLoad[] = ["welcome", "calm", "normal", "busy"];

const HOLIDAYS: readonly HolidayPhase[] = ["none", "during", "eve"];

const CHILD_COUNTS = [1, 2, 3, 4] as const;

const UNITS: readonly GridUnits[] = [2, 4];

const SECONDARY_IDS = [
  "review",
  "progress",
  "documents",
  "outings",
  "overdue",
  "assessments",
  "reminders",
  "workload",
] as const;

const NOTHING_EMPTY: ReadonlySet<string> = new Set();

function childIdsOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `kid${index + 1}`);
}

function contextOf(
  moment: AdviceMoment,
  childCount: number,
  data: DataLoad,
  holiday: HolidayPhase,
): AdviceContext {
  const childIds = childIdsOf(childCount);

  return { moment, children: childrenCountOf(childCount), childIds, data, holiday };
}

function expectedHero({ moment, data, holiday }: AdviceContext): string {
  if (data === "welcome") return "welcome";
  if (holiday === "during") return "calendar";
  if (holiday === "eve") return "tonight";
  if (moment === "morning") return "today";
  if (moment === "evening") return "tonight";

  return "calendar";
}

function expectPackedExactly(blocks: readonly LayoutBlock[], units: GridUnits): void {
  const sizes = new Map(blocks.map(({ id, size }) => [id, size]));
  const sizeOf = (id: string): BlockSize => sizes.get(id) ?? "s";
  const { items } = pack(
    blocks.map(({ id }) => id),
    sizeOf,
    units,
  );

  expect(items.map(({ id }) => id)).toEqual(blocks.map(({ id }) => id));
  expect(items.filter(({ grown, pulled }) => grown || pulled)).toEqual([]);
}

const contexts = MOMENTS.flatMap((moment) =>
  CHILD_COUNTS.flatMap((count) =>
    DATA.flatMap((data) => HOLIDAYS.map((holiday) => contextOf(moment, count, data, holiday))),
  ),
);

const cases = contexts.flatMap((context) => UNITS.map((units) => ({ context, units })));

describe("the advised home over every context", () => {
  it.each(cases)(
    "given $context.moment, $context.childIds.length children, $context.data, holidays $context.holiday on $units units, then the hero of the moment leads and pack lays the recipe exactly",
    ({ context, units }) => {
      const advice = adviseLayout(context, units, NOTHING_EMPTY);

      expect(advice.heroId).toBe(expectedHero(context));
      expect(advice.blocks[0]?.id).toBe(advice.heroId);
      expectPackedExactly(advice.blocks, units);
    },
  );
});

function recipe(...entries: [string, BlockSize][]): LayoutBlock[] {
  return entries.map(([id, size]) => ({ id, size }));
}

describe("the recipes of the spec", () => {
  it.each([
    [
      "a school morning with 2 children",
      contextOf("morning", 2, "normal", "none"),
      recipe(
        ["today", "l"],
        ["review", "m"],
        ["overdue", "m"],
        ["calendar", "xl"],
        ["documents", "m"],
        ["assessments", "m"],
        ["notes", "m"],
        ["progress", "s"],
        ["outings", "s"],
      ),
    ],
    [
      "a school evening with 2 children",
      contextOf("evening", 2, "normal", "none"),
      recipe(
        ["tonight", "l"],
        ["assessments", "m"],
        ["documents", "m"],
        ["calendar", "xl"],
        ["review", "m"],
        ["overdue", "m"],
        ["notes", "m"],
        ["progress", "s"],
        ["outings", "s"],
      ),
    ],
    [
      "a weekend with 2 children",
      contextOf("week", 2, "normal", "none"),
      recipe(
        ["calendar", "xl"],
        ["workload", "l"],
        ["child:kid1", "m"],
        ["child:kid2", "m"],
        ["documents", "m"],
        ["review", "m"],
        ["notes", "m"],
        ["progress", "s"],
        ["outings", "s"],
      ),
    ],
    [
      "a weekend with 3 children",
      contextOf("week", 3, "normal", "none"),
      recipe(
        ["calendar", "xl"],
        ["workload", "l"],
        ["child:kid1", "m"],
        ["child:kid2", "m"],
        ["child:kid3", "m"],
        ["notes", "m"],
        ["documents", "m"],
        ["review", "m"],
      ),
    ],
    [
      "a busy school morning",
      contextOf("morning", 2, "busy", "none"),
      recipe(
        ["today", "l"],
        ["workload", "m"],
        ["assessments", "m"],
        ["calendar", "xl"],
        ["review", "m"],
        ["overdue", "m"],
        ["documents", "m"],
        ["notes", "m"],
      ),
    ],
    [
      "a new parent",
      contextOf("morning", 1, "welcome", "none"),
      recipe(["welcome", "l"], ["notes", "l"], ["calendar", "xl"]),
    ],
    [
      "the holidays",
      contextOf("morning", 2, "normal", "during"),
      recipe(
        ["calendar", "xl"],
        ["overdue", "l"],
        ["notes", "m"],
        ["documents", "s"],
        ["outings", "s"],
      ),
    ],
    [
      "the evening before school resumes",
      contextOf("evening", 2, "normal", "eve"),
      recipe(
        ["tonight", "l"],
        ["assessments", "m"],
        ["documents", "m"],
        ["calendar", "xl"],
        ["review", "m"],
        ["overdue", "m"],
        ["notes", "m"],
        ["progress", "s"],
        ["outings", "s"],
      ),
    ],
  ])("given %s on 4 units, then the recipe follows the table", (_, context, expected) => {
    expect(adviseLayout(context, 4, NOTHING_EMPTY).blocks).toEqual(expected);
  });

  it("given a calm morning whose secondaries are empty, then an empty glance gives way and the rest gathers beside the hero", () => {
    const empty = new Set(["review", "overdue", "documents", "assessments", "progress", "outings"]);

    const advice = adviseLayout(contextOf("morning", 2, "calm", "none"), 4, empty);

    expect(advice.blocks).toEqual(
      recipe(["today", "l"], ["notes", "m"], ["review", "s"], ["overdue", "s"], ["calendar", "xl"]),
    );
  });
});

describe("a row that the recipe leaves incomplete", () => {
  it("given a weekend with 1 child where nearly every block is empty on 4 units, then two empty blocks keep M rather than leave the calendar alone", () => {
    const empty = new Set(["review", "documents", "outings", "assessments", "workload"]);

    const advice = adviseLayout(contextOf("week", 1, "calm", "none"), 4, empty);

    expect(advice.blocks).toEqual(
      recipe(
        ["calendar", "xl"],
        ["documents", "m"],
        ["review", "m"],
        ["notes", "m"],
        ["outings", "s"],
        ["progress", "s"],
      ),
    );
  });

  it("given a school morning without overdue homework on 4 units, then the empty overdue block keeps M to close the row", () => {
    const advice = adviseLayout(contextOf("morning", 2, "normal", "none"), 4, new Set(["overdue"]));

    expect(advice.blocks).toEqual(
      recipe(
        ["today", "l"],
        ["review", "m"],
        ["overdue", "m"],
        ["calendar", "xl"],
        ["documents", "m"],
        ["assessments", "m"],
        ["notes", "m"],
        ["progress", "s"],
        ["outings", "s"],
      ),
    );
  });

  it("given the holidays without overdue homework nor documents on 4 units, then documents keeps M and nothing is removed", () => {
    const advice = adviseLayout(
      contextOf("morning", 2, "normal", "during"),
      4,
      new Set(["overdue", "documents"]),
    );

    expect(advice.blocks).toEqual(
      recipe(
        ["calendar", "xl"],
        ["documents", "m"],
        ["notes", "m"],
        ["outings", "m"],
        ["overdue", "s"],
        ["progress", "s"],
      ),
    );
  });

  it("given a weekend with 1 child on 4 units, when nothing else closes the row, then workload leaves and the lowest secondaries shrink", () => {
    const advice = adviseLayout(contextOf("week", 1, "normal", "none"), 4, NOTHING_EMPTY);

    expect(advice.blocks).toEqual(
      recipe(
        ["calendar", "xl"],
        ["assessments", "m"],
        ["outings", "m"],
        ["notes", "m"],
        ["documents", "s"],
        ["review", "s"],
      ),
    );
  });

  it("given a weekend with 1 child on a phone, then the two lowest secondaries shrink and nothing is removed", () => {
    const advice = adviseLayout(contextOf("week", 1, "normal", "none"), 2, NOTHING_EMPTY);

    expect(advice.blocks).toEqual(
      recipe(
        ["calendar", "xl"],
        ["workload", "l"],
        ["assessments", "m"],
        ["outings", "m"],
        ["notes", "m"],
        ["documents", "s"],
        ["review", "s"],
      ),
    );
  });

  it("given a school morning without assessments on 4 units, then notes gives way and documents and overdue shrink", () => {
    const advice = adviseLayout(
      contextOf("morning", 2, "normal", "none"),
      4,
      new Set(["assessments"]),
    );

    expect(advice.blocks).toEqual(
      recipe(
        ["today", "l"],
        ["review", "m"],
        ["overdue", "s"],
        ["documents", "s"],
        ["calendar", "xl"],
      ),
    );
  });

  it("given a school morning without assessments on a phone, then every block keeps its size", () => {
    const advice = adviseLayout(
      contextOf("morning", 2, "normal", "none"),
      2,
      new Set(["assessments"]),
    );

    expect(advice.blocks).toEqual(
      recipe(
        ["today", "l"],
        ["review", "m"],
        ["overdue", "m"],
        ["calendar", "xl"],
        ["documents", "m"],
        ["notes", "m"],
      ),
    );
  });
});

const FILLER_QUARTERS: Record<string, number> = { notes: 2, progress: 1, outings: 1 };

const QUARTERS_OF: Record<CellSize, number> = { s: 1, m: 2, l: 4 };

function subsetSums(values: readonly number[]): number[] {
  return values.reduce<number[]>((sums, value) => sums.concat(sums.map((sum) => sum + value)), [0]);
}

function fillsRows(quarters: number, units: GridUnits, besideHero: boolean): boolean {
  if (quarters % 4 !== 0) return false;
  if (units === 2) return true;

  const cellsUnderHero = quarters / 4 - (besideHero ? 1 : 0);

  return cellsUnderHero >= 0 && cellsUnderHero % 2 === 0;
}

function fitsWithFillers(blocks: readonly Secondary[], units: GridUnits, besideHero: boolean) {
  const ids = new Set(blocks.map(({ id }) => id));
  const quarters = blocks.reduce((total, { size }) => total + QUARTERS_OF[size], 0);
  const fillers = Object.entries(FILLER_QUARTERS)
    .filter(([id]) => !ids.has(id))
    .map(([, value]) => value);

  return subsetSums(fillers).some((extra) => fillsRows(quarters + extra, units, besideHero));
}

function subsetsOf<T>(items: readonly T[]): T[][] {
  return items.reduce<T[][]>(
    (subsets, item) => subsets.concat(subsets.map((subset) => [...subset, item])),
    [[]],
  );
}

function someEmptiesKeptFit(blocks: readonly Secondary[], units: GridUnits, besideHero: boolean) {
  const keepable = blocks.filter(({ empty, size, recipeSize }) => empty && size !== recipeSize);

  return subsetsOf(keepable).some((kept) =>
    fitsWithFillers(
      blocks.map(
        (block): Secondary => (kept.includes(block) ? { ...block, size: block.recipeSize } : block),
      ),
      units,
      besideHero,
    ),
  );
}

function someShrinkFits(blocks: readonly Secondary[], units: GridUnits, besideHero: boolean) {
  const shrinkable = [...blocks]
    .reverse()
    .filter(({ id, size }) => size !== "s" && allowsSize(id, "s"));

  return Array.from({ length: shrinkable.length + 1 }, (_, count) => {
    const shrunk = new Set(shrinkable.slice(0, count));

    return blocks.map((block): Secondary => (shrunk.has(block) ? { ...block, size: "s" } : block));
  }).some((sized) => fitsWithFillers(sized, units, besideHero));
}

const contextArb = fc
  .record({
    moment: fc.constantFrom(...MOMENTS),
    childCount: fc.integer({ min: 0, max: 6 }),
    data: fc.constantFrom(...DATA),
    holiday: fc.constantFrom(...HOLIDAYS),
  })
  .map(({ moment, childCount, data, holiday }) => contextOf(moment, childCount, data, holiday));

const emptyArb = fc
  .subarray([...SECONDARY_IDS, ...childIdsOf(6).map((id) => `child:${id}`)])
  .map((ids) => new Set(ids));

const adviceArb = fc.record({
  context: contextArb,
  units: fc.constantFrom(...UNITS),
  empty: emptyArb,
});

describe("properties of the advised home", () => {
  it("given any context, then there is one hero and it comes first", () => {
    fc.assert(
      fc.property(adviceArb, ({ context, units, empty }) => {
        const { heroId, blocks } = adviseLayout(context, units, empty);
        const ids = blocks.map(({ id }) => id);

        expect(ids[0]).toBe(heroId);
        expect(new Set(ids).size).toBe(ids.length);
      }),
    );
  });

  it("given any context, then the calendar is there and never under M", () => {
    fc.assert(
      fc.property(adviceArb, ({ context, units, empty }) => {
        const calendar = adviseLayout(context, units, empty).blocks.find(
          ({ id }) => id === "calendar",
        );

        expect(calendar?.size).toBe("xl");
      }),
    );
  });

  it("given any context, then every size is allowed by the registry", () => {
    fc.assert(
      fc.property(adviceArb, ({ context, units, empty }) => {
        for (const { id, size } of adviseLayout(context, units, empty).blocks)
          expect(allowsSize(id, size)).toBe(true);
      }),
    );
  });

  it("given any context, then an empty block that allows S is shown in S, unless keeping it at its recipe size closes a row no shrink could", () => {
    fc.assert(
      fc.property(adviceArb, ({ context, units, empty }) => {
        const { hero, secondaries } = adviceRecipe(context, empty);
        const blocks = adviseLayout(context, units, empty).blocks;
        const keptAtSize = blocks.filter(
          ({ id, size }) => empty.has(id) && allowsSize(id, "s") && size !== "s",
        );
        const besideHero = hero.size !== "xl" && units === 4;

        for (const { id, size } of keptAtSize) {
          expect(size).toBe(secondaries.find((block) => block.id === id)?.recipeSize);
          expect(someShrinkFits(secondaries, units, besideHero)).toBe(false);
        }
      }),
    );
  });

  it("given any context, then no block is removed while keeping empty blocks at their size closes the row", () => {
    fc.assert(
      fc.property(adviceArb, ({ context, units, empty }) => {
        const { hero, secondaries } = adviceRecipe(context, empty);
        const shown = new Set(adviseLayout(context, units, empty).blocks.map(({ id }) => id));
        const removed = secondaries.filter(({ id }) => !shown.has(id));
        const besideHero = hero.size !== "xl" && units === 4;

        if (removed.length > 0)
          expect(someEmptiesKeptFit(secondaries, units, besideHero)).toBe(false);
      }),
    );
  });

  it("given any context, then no full block is removed while a secondary can still shrink", () => {
    fc.assert(
      fc.property(adviceArb, ({ context, units, empty }) => {
        const { hero, secondaries } = adviceRecipe(context, empty);
        const shown = new Set(adviseLayout(context, units, empty).blocks.map(({ id }) => id));
        const removedFull = secondaries.filter(({ id }) => !shown.has(id) && !empty.has(id));
        const besideHero = hero.size !== "xl" && units === 4;

        if (removedFull.length > 0)
          expect(someShrinkFits(secondaries, units, besideHero)).toBe(false);
      }),
    );
  });

  it("given any context but the welcome, then the page shows at least 3 blocks", () => {
    fc.assert(
      fc.property(adviceArb, ({ context, units, empty }) => {
        const { blocks } = adviseLayout(context, units, empty);

        if (context.data !== "welcome") expect(blocks.length).toBeGreaterThanOrEqual(3);
      }),
    );
  });

  it("given any context, then pack lays the recipe exactly, without grown nor pulled", () => {
    fc.assert(
      fc.property(adviceArb, ({ context, units, empty }) => {
        expectPackedExactly(adviseLayout(context, units, empty).blocks, units);
      }),
    );
  });
});
