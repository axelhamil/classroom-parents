import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type BlockSize,
  type GridColumns,
  sizeAt,
  sizeKey,
} from "../../../shared/dashboard/block-size";
import { type Placed, pack } from "../../../shared/dashboard/dashboard-pack";
import { blocksIn, withoutPinned } from "../../../shared/dashboard/layout-commands";
import {
  type AdviceContext,
  type AdviceMoment,
  childrenCountOf,
  type DataLoad,
  type HolidayPhase,
} from "../advise-context";
import { adviseLayout } from "../advise-layout";
import { adviceRecipe, type RecipeBlock } from "../advise-recipe";
import { ADVICE_ONLY_BLOCK_IDS, boundsOf } from "../home-block-bounds";
import { advisedHomeOf, layoutOf, savedBlocksOf } from "../home-layout-draft";

const MOMENTS: readonly AdviceMoment[] = ["morning", "evening", "week"];

const DATA: readonly DataLoad[] = ["welcome", "calm", "normal", "busy"];

const HOLIDAYS: readonly HolidayPhase[] = ["none", "during", "eve"];

const CHILD_COUNTS = [1, 2, 3, 4] as const;

const COLUMNS: readonly GridColumns[] = [1, 2, 3, 4];

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

const ACTION_IDS = ["review", "overdue"];

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

/** The cases under the bottom of the page that no block covers, or that two blocks do. */
function holesIn(items: readonly Placed[], columns: number): string[] {
  const rows = Math.max(0, ...items.map(({ y, h }) => y + h));

  return Array.from({ length: rows * columns }, (_, index) => {
    const x = index % columns;
    const y = Math.floor(index / columns);
    const covering = items.filter(
      (item) => x >= item.x && x < item.x + item.w && y >= item.y && y < item.y + item.h,
    );

    return covering.length === 1 ? [] : [`${x},${y}: ${covering.length}`];
  }).flat();
}

function expectLaidExactly(blocks: readonly RecipeBlock[], columns: GridColumns): void {
  const items = pack(blocks, columns);

  expect(items.map(({ id, w, h }) => ({ id, size: { w, h } }))).toEqual(blocks);
  expect(holesIn(items, columns)).toEqual([]);
}

function outOfBounds(blocks: readonly RecipeBlock[], columns: GridColumns): string[] {
  return blocks.flatMap(({ id, size }) =>
    sizeKey(sizeAt(size, boundsOf(id), columns)) === sizeKey(size) ? [] : [id],
  );
}

function area({ w, h }: BlockSize): number {
  return w * h;
}

/** A layout written `id wxh`, one block per entry. */
function laid(...entries: string[]): RecipeBlock[] {
  return entries.map((entry) => {
    const [id = "", size = ""] = entry.split(" ");
    const [w = 0, h = 0] = size.split("x").map(Number);

    return { id, size: { w, h } };
  });
}

const contexts = MOMENTS.flatMap((moment) =>
  CHILD_COUNTS.flatMap((count) =>
    DATA.flatMap((data) => HOLIDAYS.map((holiday) => contextOf(moment, count, data, holiday))),
  ),
);

const cases = contexts.flatMap((context) => COLUMNS.map((columns) => ({ context, columns })));

describe("the advised home over every context", () => {
  it.each(cases)(
    "given $context.moment, $context.childIds.length children, $context.data, holidays $context.holiday on $columns columns, then the hero of the moment leads and pack lays every block in its bounds without a hole",
    ({ context, columns }) => {
      const advice = adviseLayout(context, columns, NOTHING_EMPTY);

      expect(advice.heroId).toBe(expectedHero(context));
      expect(advice.blocks[0]?.id).toBe(advice.heroId);
      expect(outOfBounds(advice.blocks, columns)).toEqual([]);
      expectLaidExactly(advice.blocks, columns);
    },
  );
});

describe("the recipes of the spec on 4 columns", () => {
  it.each([
    [
      "a school morning with 2 children",
      contextOf("morning", 2, "normal", "none"),
      laid(
        "today 2x2",
        "review 2x1",
        "overdue 2x1",
        "calendar 4x2",
        "documents 2x1",
        "assessments 2x1",
        "notes 2x1",
        "progress 1x1",
        "outings 1x1",
      ),
    ],
    [
      "a school evening with 2 children",
      contextOf("evening", 2, "normal", "none"),
      laid(
        "tonight 2x2",
        "assessments 2x1",
        "documents 2x1",
        "calendar 4x2",
        "review 2x1",
        "overdue 2x1",
        "notes 2x1",
        "progress 1x1",
        "outings 1x1",
      ),
    ],
    [
      "a weekend with 2 children",
      contextOf("week", 2, "normal", "none"),
      laid(
        "calendar 4x2",
        "workload 2x2",
        "child:kid1 2x1",
        "child:kid2 2x1",
        "documents 2x1",
        "review 2x1",
        "notes 2x1",
        "progress 1x1",
        "outings 1x1",
      ),
    ],
    [
      "a weekend with 3 children",
      contextOf("week", 3, "normal", "none"),
      laid(
        "calendar 4x2",
        "workload 2x2",
        "child:kid1 2x1",
        "child:kid2 2x1",
        "child:kid3 2x1",
        "notes 2x1",
        "documents 2x1",
        "review 2x1",
      ),
    ],
    [
      "a busy school morning",
      contextOf("morning", 2, "busy", "none"),
      laid(
        "today 2x2",
        "workload 2x1",
        "assessments 2x1",
        "calendar 4x2",
        "review 2x1",
        "overdue 2x1",
        "documents 2x1",
        "notes 2x1",
      ),
    ],
    [
      "a new parent",
      contextOf("morning", 1, "welcome", "none"),
      laid("welcome 2x2", "notes 2x2", "calendar 4x2"),
    ],
    [
      "the holidays",
      contextOf("morning", 2, "normal", "during"),
      laid("calendar 4x2", "overdue 2x2", "notes 2x1", "documents 1x1", "outings 1x1"),
    ],
    [
      "the evening before school resumes",
      contextOf("evening", 2, "normal", "eve"),
      laid(
        "tonight 2x2",
        "assessments 2x1",
        "documents 2x1",
        "calendar 4x2",
        "review 2x1",
        "overdue 2x1",
        "notes 2x1",
        "progress 1x1",
        "outings 1x1",
      ),
    ],
    [
      "a weekend with 1 child, where workload keeps its two rows and review its row, the lower glances closing the last",
      contextOf("week", 1, "normal", "none"),
      laid(
        "calendar 4x2",
        "workload 2x2",
        "assessments 2x1",
        "review 2x1",
        "notes 2x1",
        "outings 1x1",
        "documents 1x1",
      ),
    ],
  ])("given %s, then the recipe follows the table", (_, context, expected) => {
    expect(adviseLayout(context, 4, NOTHING_EMPTY).blocks).toEqual(expected);
  });

  it("given a calm morning whose secondaries are empty, then the empty ones gather in a row of glances under the Agenda", () => {
    const empty = new Set(["review", "overdue", "documents", "assessments", "progress", "outings"]);

    const advice = adviseLayout(contextOf("morning", 2, "calm", "none"), 4, empty);

    expect(advice.blocks).toEqual(
      laid(
        "today 2x2",
        "documents 2x1",
        "notes 2x1",
        "calendar 4x2",
        "review 1x1",
        "overdue 1x1",
        "progress 1x1",
        "outings 1x1",
      ),
    );
  });
});

describe("the home on 3 columns", () => {
  it("given a school morning, then review stands beside the hero on one column and two rows, its action in view, and the Agenda takes the whole row", () => {
    const advice = adviseLayout(contextOf("morning", 2, "normal", "none"), 3, NOTHING_EMPTY);

    expect(advice.blocks.slice(0, 3)).toEqual(laid("today 2x2", "review 1x2", "calendar 3x2"));
  });

  it("given a new parent, then notes stands beside the welcome on one column, above the Agenda", () => {
    const advice = adviseLayout(contextOf("morning", 1, "welcome", "none"), 3, NOTHING_EMPTY);

    expect(advice.blocks).toEqual(laid("welcome 2x2", "notes 1x2", "calendar 3x2"));
  });

  it("given a new parent with nothing to stand beside the welcome, then the welcome takes the whole row", () => {
    const advice = adviseLayout(contextOf("morning", 1, "welcome", "none"), 3, new Set(["notes"]));

    expect(advice.blocks).toEqual(laid("welcome 3x2", "calendar 3x2"));
  });

  it("given a weekend, then the Agenda crowned takes the whole first row", () => {
    const advice = adviseLayout(contextOf("week", 2, "normal", "none"), 3, NOTHING_EMPTY);

    expect(advice.blocks[0]).toEqual({ id: "calendar", size: { w: 3, h: 2 } });
  });
});

describe("the home on a phone", () => {
  it("given a school morning, then the blocks to act on keep two rows, their list and buttons", () => {
    const advice = adviseLayout(contextOf("morning", 2, "normal", "none"), 1, NOTHING_EMPTY);

    expect(advice.blocks.slice(0, 4)).toEqual(
      laid("today 1x2", "review 1x2", "calendar 1x2", "overdue 1x2"),
    );
  });

  it("given nothing to review nor late, then those blocks are glances", () => {
    const empty = new Set(["review", "overdue"]);

    const advice = adviseLayout(contextOf("morning", 2, "normal", "none"), 1, empty);

    expect(advice.blocks.filter(({ id }) => ACTION_IDS.includes(id))).toEqual(
      laid("review 1x1", "overdue 1x1"),
    );
  });

  it("given a new parent, then the welcome leads with notes under it, before the Agenda", () => {
    const advice = adviseLayout(contextOf("morning", 1, "welcome", "none"), 1, NOTHING_EMPTY);

    expect(advice.blocks).toEqual(laid("welcome 1x2", "notes 1x2", "calendar 1x2"));
  });
});

const contextArb = fc
  .record({
    moment: fc.constantFrom(...MOMENTS),
    childCount: fc.integer({ min: 0, max: 6 }),
    data: fc.constantFrom(...DATA),
    holiday: fc.constantFrom(...HOLIDAYS),
  })
  .map(({ moment, childCount, data, holiday }) => contextOf(moment, childCount, data, holiday));

const emptyArb = fc
  .subarray([...SECONDARY_IDS, "notes", ...childIdsOf(6).map((id) => `child:${id}`)])
  .map((ids) => new Set(ids));

const adviceArb = fc.record({
  context: contextArb,
  columns: fc.constantFrom(...COLUMNS),
  empty: emptyArb,
});

describe("properties of the advised home", () => {
  it("given any context, then there is one hero, it comes first and no block is twice", () => {
    fc.assert(
      fc.property(adviceArb, ({ context, columns, empty }) => {
        const { heroId, blocks } = adviseLayout(context, columns, empty);
        const ids = blocks.map(({ id }) => id);

        expect(ids[0]).toBe(heroId);
        expect(new Set(ids).size).toBe(ids.length);
      }),
    );
  });

  it("given any context, then the home draws each block at the size the advice chose for the columns", () => {
    fc.assert(
      fc.property(adviceArb, ({ context, columns, empty }) => {
        const snapshot = { context, emptyBlocks: empty, holiday: null };
        const advised = adviseLayout(context, columns, empty).blocks;
        const registry = advised.map(({ id }) => id);
        const home = advisedHomeOf(snapshot, columns, registry).blocks;

        const drawn = home.map(({ id, size }) => ({
          id,
          size: sizeAt(size, boundsOf(id), columns),
        }));

        expect(drawn).toEqual(advised);
      }),
    );
  });

  it("given any context, when the advice is saved then read back, then the home draws each block where the advice drew it", () => {
    fc.assert(
      fc.property(adviceArb, ({ context, columns, empty }) => {
        const snapshot = { context, emptyBlocks: empty, holiday: null };
        const advised = adviseLayout(context, columns, empty).blocks;
        const registry = advised.map(({ id }) => id);
        const home = advisedHomeOf(snapshot, columns, registry).blocks;

        const readBack = blocksIn(layoutOf(savedBlocksOf(home), registry));

        const drawn = readBack.map(({ id, size }) => ({
          id,
          size: sizeAt(size, boundsOf(id), columns),
        }));
        const kept = new Set(readBack.map(({ id }) => id));
        expect(drawn).toEqual(advised.filter(({ id }) => kept.has(id)));
        expect(kept.size).toBe(withoutPinned(advised, ADVICE_ONLY_BLOCK_IDS).length);
      }),
    );
  });

  it("given any context, then the Agenda is there over the whole row", () => {
    fc.assert(
      fc.property(adviceArb, ({ context, columns, empty }) => {
        const agenda = adviseLayout(context, columns, empty).blocks.find(
          ({ id }) => id === "calendar",
        );

        expect(agenda?.size.w).toBe(columns);
      }),
    );
  });

  it("given any context, then every block is within its bounds at the column count", () => {
    fc.assert(
      fc.property(adviceArb, ({ context, columns, empty }) => {
        expect(outOfBounds(adviseLayout(context, columns, empty).blocks, columns)).toEqual([]);
      }),
    );
  });

  it("given any context, then pack lays the advice exactly, in its order, without a hole", () => {
    fc.assert(
      fc.property(adviceArb, ({ context, columns, empty }) => {
        expectLaidExactly(adviseLayout(context, columns, empty).blocks, columns);
      }),
    );
  });

  it("given any context, then an empty block never takes more room than its recipe gives it", () => {
    fc.assert(
      fc.property(adviceArb, ({ context, columns, empty }) => {
        const { secondaries } = adviceRecipe(context, columns, empty);

        for (const { id, size } of adviseLayout(context, columns, empty).blocks) {
          const recipe = secondaries.find((block) => block.id === id);
          if (recipe?.empty) expect(area(size)).toBeLessThanOrEqual(area(recipe.recipeSize));
        }
      }),
    );
  });

  it("given any context at any width, then a block to act on that is not empty is never a glance", () => {
    fc.assert(
      fc.property(adviceArb, ({ context, columns, empty }) => {
        const acting = adviseLayout(context, columns, empty).blocks.filter(
          ({ id }) => ACTION_IDS.includes(id) && !empty.has(id),
        );

        for (const { size } of acting) expect(area(size)).toBeGreaterThanOrEqual(2);
      }),
    );
  });

  it("given any context but the welcome, then the page shows at least 3 blocks", () => {
    fc.assert(
      fc.property(adviceArb, ({ context, columns, empty }) => {
        const { blocks } = adviseLayout(context, columns, empty);

        if (context.data !== "welcome") expect(blocks.length).toBeGreaterThanOrEqual(3);
      }),
    );
  });

  it("given a new parent, then the welcome leads at every width", () => {
    fc.assert(
      fc.property(adviceArb, ({ context, columns, empty }) => {
        const welcome = { ...context, data: "welcome" as const };

        expect(adviseLayout(welcome, columns, empty).blocks[0]?.id).toBe("welcome");
      }),
    );
  });

  it("given the same facts twice, then the advice is the same", () => {
    fc.assert(
      fc.property(adviceArb, ({ context, columns, empty }) => {
        expect(adviseLayout(context, columns, new Set(empty))).toEqual(
          adviseLayout(context, columns, empty),
        );
      }),
    );
  });
});
