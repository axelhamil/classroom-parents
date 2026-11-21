// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderAppAt, resetApp } from "../../../__tests__/app-harness";
import { givenCalendar } from "../../../__tests__/calendar-fixtures";
import { CHILD } from "../../../__tests__/family-fixtures";
import { givenWideScreen } from "../../../__tests__/match-media";
import { at, deadline, HUGO } from "../../../__tests__/week-fixtures";
import { askedStepsOf } from "../../../shared/agenda/checklist-template";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
}));

const THURSDAY_MORNING = "2026-11-12T09:00:00.000Z";
const THURSDAY_EVENING = "2026-11-12T17:00:00.000Z";

const WITH_TONIGHT = {
  homeLayout: [
    { id: "today", w: 2, h: 2 },
    { id: "tonight", w: 2, h: 1 },
    { id: "calendar", w: 4, h: 2 },
  ],
};

async function tonight(): Promise<HTMLElement> {
  return screen.findByRole("region", { name: "Pour ce soir" });
}

const GOURDE_ONLY = {
  parentActions: [],
  toBring: [{ item: "Gourde", quote: "Chaque enfant apporte une gourde." }],
};

function boxOf(region: HTMLElement, label: string): HTMLElement {
  const box = within(region)
    .queryAllByRole("checkbox")
    .find(
      (candidate) => document.querySelector(`label[for="${candidate.id}"]`)?.textContent === label,
    );
  if (!box) throw new Error(`no step ${label}`);

  return box;
}

const withPlainSpaces = (text: string) => text.replace(/\s/g, " ");

function stepsIn(region: HTMLElement, only?: "suggested"): string[] {
  return within(region)
    .queryAllByRole("checkbox")
    .filter((box) => !only || box.getAttribute("aria-description") === "suggestion")
    .map((box) => document.querySelector(`label[for="${box.id}"]`)?.textContent ?? "");
}

describe("Pour ce soir lists what to do tonight for the next school day", () => {
  beforeEach(givenWideScreen);

  afterEach(() => {
    cleanup();
    resetApp();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("given two deadlines tomorrow with template steps only, it offers them as ideas, never as their cards", async () => {
    at(THURSDAY_EVENING);
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-13", "Exercices de grammaire"),
        deadline(2, "2026-11-13", "Évaluation de calcul", { category: "assessment" }),
      ],
      WITH_TONIGHT,
    );
    await renderAppAt("/");

    const block = await tonight();
    expect(await within(block).findByText("Quelques idées pour demain")).toBeDefined();
    expect(stepsIn(block)).toEqual(["Vérifier qu'il est fait", "Réviser la veille"]);
    expect(within(block).queryAllByRole("link")).toEqual([]);
    expect(within(block).queryByText(/Rien/)).toBeNull();
  });

  it("given a swimming session and an added item, the added item is to prepare and the bag a suggestion", async () => {
    at(THURSDAY_EVENING);
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-13", "Piscine", {
          category: "swimming",
          checklist: {
            done: ["prepare.items.swimming.swimsuit"],
            removed: ["prepare.items.swimming.showerGel"],
            extra: [{ id: "atlas", label: "Atlas" }],
          },
        }),
      ],
      WITH_TONIGHT,
    );
    await renderAppAt("/");

    const block = await tonight();
    await within(block).findByText("Atlas");
    expect(within(block).getByText("À préparer pour demain")).toBeDefined();
    expect(stepsIn(block)).toEqual(["Atlas", "Maillot de bain", "Bonnet de bain", "Serviette"]);
    expect(stepsIn(block, "suggested")).toEqual(["Maillot de bain", "Bonnet de bain", "Serviette"]);
    expect(within(block).queryByText("Suggestions")).toBeNull();
  });

  it("groups the steps by child", async () => {
    at(THURSDAY_EVENING);
    givenCalendar(
      [CHILD, HUGO],
      [
        deadline(1, "2026-11-13", "Exercices", { childId: CHILD.id }),
        deadline(2, "2026-11-13", "Dictée", { childId: HUGO.id, category: "assessment" }),
      ],
      WITH_TONIGHT,
    );
    await renderAppAt("/");

    const block = await tonight();
    const hugo = await within(block).findByRole("region", { name: "Hugo" });
    expect(stepsIn(hugo)).toEqual(["Réviser la veille"]);
    const first = within(block).getByRole("region", { name: CHILD.label });
    expect(stepsIn(first)).toEqual(["Vérifier qu'il est fait"]);
  });

  it("given deadlines tomorrow already prepared, it says so and counts them", async () => {
    at(THURSDAY_EVENING);
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-13", "Fiche rendue", { done: true }),
        deadline(2, "2026-11-13", "Exercices", {
          checklist: { done: ["prepare.items.homework.check"], removed: [], extra: [] },
        }),
      ],
      WITH_TONIGHT,
    );
    await renderAppAt("/");

    const block = await tonight();
    expect(
      await within(block).findByText(
        "2 échéances demain, déjà prêtes : rien à mettre dans le sac.",
      ),
    ).toBeDefined();
    expect(stepsIn(block)).toEqual([]);
  });

  it("given nothing due tomorrow, it says nothing is planned", async () => {
    at(THURSDAY_EVENING);
    givenCalendar([CHILD], [deadline(1, "2026-11-17", "Exposé")], WITH_TONIGHT);
    await renderAppAt("/");

    expect(await within(await tonight()).findByText("Rien de prévu demain")).toBeDefined();
  });

  it("during the school day, today's deadlines stay with Pour aujourd'hui", async () => {
    at(THURSDAY_MORNING);
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-12", "Mot à signer", { category: "document_due" }),
        deadline(2, "2026-11-13", "Évaluation de calcul", { category: "assessment" }),
      ],
      WITH_TONIGHT,
    );
    await renderAppAt("/");

    const block = await tonight();
    await within(block).findByText("Quelques idées pour demain");
    expect(stepsIn(block)).toEqual(["Réviser la veille"]);
  });

  it("given an outing whose announcement asks to pay and to bring, what it asks comes first, the template apart", async () => {
    at(THURSDAY_EVENING);
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-13", "Sortie au musée", {
          category: "school_trip",
          preparation: {
            parentActions: [
              {
                kind: "pay",
                label: "Payer la sortie",
                amountCents: 1250,
                currency: "EUR",
                quote: "Merci de régler 12,50 € avant vendredi.",
              },
            ],
            toBring: [{ item: "Gourde", quote: "Chaque enfant apporte une gourde." }],
          },
        }),
      ],
      WITH_TONIGHT,
    );
    await renderAppAt("/");

    const block = await tonight();
    await within(block).findByText("À préparer pour demain");
    const ideas = stepsIn(block, "suggested");
    const asked = stepsIn(block).filter((step) => !ideas.includes(step));
    expect(asked.map(withPlainSpaces)).toEqual(["Payer la sortie : 12,50 €", "Gourde"]);
    expect(ideas).toEqual(["Pique-nique", "Tenue adaptée", "Autorisation signée"]);
  });

  it("given every step the announcement asks ticked, the template left open is only an idea", async () => {
    at(THURSDAY_EVENING);
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-13", "Sortie au musée", {
          category: "school_trip",
          preparation: GOURDE_ONLY,
          checklist: {
            done: askedStepsOf({ preparation: GOURDE_ONLY }).map(({ id }) => id),
            removed: [],
            extra: [],
          },
        }),
      ],
      WITH_TONIGHT,
    );
    await renderAppAt("/");

    expect(await within(await tonight()).findByText("Quelques idées pour demain")).toBeDefined();
  });

  it("given the announcement reread with its steps in another order, each tick stays on its step", async () => {
    const sign = {
      kind: "sign",
      label: "Signer l'autorisation",
      amountCents: null,
      currency: null,
      quote: "Autorisation à signer.",
    };
    const giveBack = {
      kind: "return",
      label: "Rendre le coupon",
      amountCents: null,
      currency: null,
      quote: "Coupon à rendre.",
    };
    const outing = (parentActions: unknown[], done: string[]) =>
      deadline(1, "2026-11-13", "Sortie au musée", {
        category: "school_trip",
        preparation: { parentActions, toBring: [] },
        checklist: { done, removed: [], extra: [] },
      });
    at(THURSDAY_EVENING);
    const stub = givenCalendar([CHILD], [outing([sign, giveBack], [])], WITH_TONIGHT);
    await renderAppAt("/");

    const before = await tonight();
    await within(before).findByText("Signer l'autorisation");
    fireEvent.click(boxOf(before, "Signer l'autorisation"));
    await waitFor(() => expect(stub.events[0]?.checklist.done).toHaveLength(1));
    const ticked = stub.events[0]?.checklist.done ?? [];
    cleanup();
    resetApp();
    givenWideScreen();

    givenCalendar([CHILD], [outing([giveBack, sign], [...ticked])], WITH_TONIGHT);
    await renderAppAt("/");

    const after = await tonight();
    await within(after).findByText("Rendre le coupon");
    expect(boxOf(after, "Signer l'autorisation").getAttribute("aria-checked")).toBe("true");
    expect(boxOf(after, "Rendre le coupon").getAttribute("aria-checked")).toBe("false");
  });

  it("given an announcement asking two different things in a non Latin script, both are steps to prepare", async () => {
    at(THURSDAY_EVENING);
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-13", "Sortie au musée", {
          category: "school_trip",
          preparation: {
            parentActions: [],
            toBring: [
              { item: "قلم", quote: "أحضر قلما." },
              { item: "كتاب", quote: "أحضر كتابا." },
            ],
          },
        }),
      ],
      WITH_TONIGHT,
    );
    await renderAppAt("/");

    const block = await tonight();
    await within(block).findByText("À préparer pour demain");
    const ideas = stepsIn(block, "suggested");
    expect(stepsIn(block).filter((step) => !ideas.includes(step))).toEqual(["قلم", "كتاب"]);
  });
});
