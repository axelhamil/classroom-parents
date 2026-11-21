import { createI18n, frCatalog } from "@packages/i18n";
import { describe, expect, it } from "vitest";
import type { AdviceContext } from "../advise-context";
import { type HeroSummaryInput, heroSummaryOf, sayHeroSummary } from "../hero-summary";

const MORNING: AdviceContext = {
  moment: "morning",
  children: "2-3",
  childIds: ["jade", "leo"],
  data: "normal",
  holiday: "none",
};

const WEEK_TO_WEDNESDAY = { count: 2, until: "2026-11-25" };

const CHRISTMAS = { name: "Vacances de Noël", endsOn: "2027-01-03" };

function input(overrides: Partial<HeroSummaryInput>): HeroSummaryInput {
  return {
    context: MORNING,
    holiday: null,
    perChild: [
      { label: "Jade", count: 2 },
      { label: "Léo", count: 1 },
    ],
    week: WEEK_TO_WEDNESDAY,
    ...overrides,
  };
}

async function say(summaryInput: HeroSummaryInput): Promise<string | undefined> {
  const i18n = await createI18n({ locale: "fr", resources: frCatalog });

  return sayHeroSummary(i18n.getFixedT("fr", "home"), heroSummaryOf(summaryInput));
}

describe("the sentence under the hero", () => {
  it.each([
    {
      given: "two children with something each",
      summary: input({}),
      sentence: "2 choses pour Jade, 1 pour Léo",
    },
    {
      given: "three children, one with nothing",
      summary: input({
        context: { ...MORNING, childIds: ["jade", "leo", "tom"] },
        perChild: [
          { label: "Jade", count: 1 },
          { label: "Léo", count: 0 },
          { label: "Tom", count: 3 },
        ],
      }),
      sentence: "1 chose pour Jade, 3 pour Tom",
    },
    {
      given: "one child",
      summary: input({
        context: { ...MORNING, children: "1", childIds: ["jade"] },
        perChild: [{ label: "Jade", count: 2 }],
      }),
      sentence: "2 choses au programme",
    },
    {
      given: "four children or more",
      summary: input({
        context: { ...MORNING, children: "4+", childIds: ["a", "b", "c", "d"] },
        perChild: [
          { label: "Jade", count: 2 },
          { label: "Léo", count: 1 },
          { label: "Tom", count: 0 },
          { label: "Zoé", count: 1 },
        ],
      }),
      sentence: "4 choses au programme",
    },
    {
      given: "a calm week",
      summary: input({ context: { ...MORNING, data: "calm" } }),
      sentence: "Semaine calme : 2 devoirs d'ici mercredi",
    },
    {
      given: "a calm week with nothing due",
      summary: input({
        context: { ...MORNING, data: "calm" },
        week: { count: 0, until: "2026-11-27" },
      }),
      sentence: "Semaine calme : aucun devoir d'ici vendredi",
    },
    {
      given: "the holidays",
      summary: input({
        context: { ...MORNING, moment: "week", data: "calm", holiday: "during" },
        holiday: CHRISTMAS,
      }),
      sentence: "Vacances de Noël jusqu'au dimanche 3 janvier",
    },
  ])("given $given, then it reads « $sentence »", async ({ summary, sentence }) => {
    expect(await say(summary)).toBe(sentence);
  });

  it("given children with nothing left, then the hero has no sentence", async () => {
    const nothing = input({
      perChild: [
        { label: "Jade", count: 0 },
        { label: "Léo", count: 0 },
      ],
    });

    expect(await say(nothing)).toBeUndefined();
  });
});
