// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import { CHILD } from "../../../__tests__/family-fixtures";
import { at, deadline, givenFamily, HUGO } from "../../../__tests__/week-fixtures";

function columnOf(child: string): HTMLElement {
  return screen.getByRole("region", { name: child });
}

describe("Planning du frigo, the printable week", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("print week lists every child's deadlines of the week with a checkbox each", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenFamily(
      [CHILD, HUGO],
      [
        deadline(1, "2026-11-13", "Piscine du vendredi", { category: "swimming" }),
        deadline(2, "2026-11-14", "Dictée des animaux", { childId: HUGO.id }),
        deadline(3, "2026-11-15", "Exposé sur les volcans"),
        deadline(4, "2026-11-18", "Contrôle de grammaire", { category: "assessment" }),
      ],
    );
    await renderAppAt("/week/print");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Semaine du 9 au 15 novembre" }),
    ).toBeDefined();
    await screen.findByRole("region", { name: "Hugo" });
    const lea = within(columnOf("Léa")).getAllByRole("listitem");
    const hugo = within(columnOf("Hugo")).getAllByRole("listitem");

    expect(lea.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Piscine du vendredi"),
      expect.stringContaining("Exposé sur les volcans"),
    ]);
    expect(hugo.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Dictée des animaux"),
    ]);
    for (const item of [...lea, ...hugo]) {
      expect(item.querySelectorAll('[data-slot="print-planner-box"]')).toHaveLength(1);
    }
    expect(screen.queryByText("Contrôle de grammaire")).toBeNull();
  });

  it("the week runs Monday to Sunday and its past days print muted", async () => {
    at("2026-11-12T09:00:00.000Z");
    const past = deadline(1, "2026-11-10", "Dictée de mardi", {
      deadlineAt: "2026-11-10T16:00:00.000Z",
    });
    const coming = deadline(2, "2026-11-13", "Piscine du vendredi", { category: "swimming" });
    stubApi(({ method, url }) => {
      if (url.pathname === "/children") return json([CHILD]);
      if (url.pathname !== "/events" || method !== "GET") return undefined;
      if (url.searchParams.get("status") === "needs_review") return json({ items: [] });
      return json({ items: url.searchParams.get("scope") === "history" ? [past] : [coming] });
    });
    await renderAppAt("/week/print");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Semaine du 9 au 15 novembre" }),
    ).toBeDefined();
    const items = within(await screen.findByRole("region", { name: "Léa" })).getAllByRole(
      "listitem",
    );

    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Dictée de mardi"),
      expect.stringContaining("Piscine du vendredi"),
    ]);
    expect(items[0]?.dataset.past).toBe("true");
    expect(items[0]?.textContent).toContain("Passée");
    expect(items[1]?.dataset.past).toBeUndefined();
  });

  it("next week is found past a full page of earlier deadlines, without asking for past ones", async () => {
    at("2026-11-12T09:00:00.000Z");
    const busyFriday = Array.from({ length: 50 }, (_, index) =>
      deadline(index + 1, "2026-11-13", `Exercice ${index + 1}`),
    );
    const calls = stubApi(({ method, url }) => {
      if (url.pathname === "/children") return json([CHILD]);
      if (url.pathname !== "/events" || method !== "GET") return undefined;
      if (url.searchParams.get("status") === "needs_review") return json({ items: [] });
      if (url.searchParams.get("cursor") === "page-2")
        return json({ items: [deadline(60, "2026-11-17", "Dictée de mardi")] });
      return json({ items: busyFriday, nextCursor: "page-2" });
    });
    await renderAppAt("/week/print?week=next");

    expect(
      await within(await screen.findByRole("region", { name: "Léa" })).findByText(
        "Dictée de mardi",
      ),
    ).toBeDefined();
    expect(calls.some((call) => call.url.searchParams.get("scope") === "history")).toBe(false);
  });

  it("past days that fail to load leave the rest of the week printable", async () => {
    at("2026-11-12T09:00:00.000Z");
    stubApi(({ method, url }) => {
      if (url.pathname === "/children") return json([CHILD]);
      if (url.pathname !== "/events" || method !== "GET") return undefined;
      if (url.searchParams.get("status") === "needs_review") return json({ items: [] });
      if (url.searchParams.get("scope") === "history") return json({ code: "INTERNAL" }, 500);
      return json({ items: [deadline(1, "2026-11-13", "Piscine du vendredi")] });
    });
    await renderAppAt("/week/print?week=current");

    const lea = await screen.findByRole("region", { name: "Léa" }, { timeout: 4000 });

    expect(within(lea).getByText("Piscine du vendredi")).toBeDefined();
    expect(
      screen.getByText("Les échéances déjà passées cette semaine n'ont pas pu être chargées."),
    ).toBeDefined();
  }, 10_000);

  it("empty child shows the friendly line", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenFamily([CHILD, HUGO], [deadline(1, "2026-11-13", "Piscine du vendredi")]);
    await renderAppAt("/week/print");

    await screen.findByRole("region", { name: "Hugo" });

    expect(within(columnOf("Hugo")).queryAllByRole("listitem")).toHaveLength(0);
    expect(
      within(columnOf("Hugo")).getByText("Rien de prévu cette semaine, profitez-en."),
    ).toBeDefined();
    expect(
      within(columnOf("Léa")).queryByText("Rien de prévu cette semaine, profitez-en."),
    ).toBeNull();
  });

  it("default week is next week from Friday evening", async () => {
    at("2026-11-13T17:00:00.000Z");
    givenFamily(
      [CHILD],
      [
        deadline(1, "2026-11-14", "Exposé sur les volcans"),
        deadline(2, "2026-11-18", "Contrôle de grammaire", { category: "assessment" }),
      ],
    );
    await renderAppAt("/week/print");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Semaine du 16 au 22 novembre" }),
    ).toBeDefined();
    expect(
      await within(await screen.findByRole("region", { name: "Léa" })).findByText(
        "Contrôle de grammaire",
      ),
    ).toBeDefined();
    expect(screen.queryByText("Exposé sur les volcans")).toBeNull();

    cleanup();
    resetApp();
    at("2026-11-13T09:00:00.000Z");
    givenFamily([CHILD], []);
    await renderAppAt("/week/print");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Semaine du 9 au 15 novembre" }),
    ).toBeDefined();
  });
});
