// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ApiCall, json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import { EVENT_BASE } from "../../../__tests__/event-fixtures";
import { CHILD } from "../../../__tests__/family-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
}));

const HUGO = { ...CHILD, id: "2b9e4c1a-7d3f-4b6e-9a8c-1f0e2d3c4b5a", label: "Hugo" };

function deadline(index: number, date: string, title: string, extra: object = {}) {
  return {
    ...EVENT_BASE,
    id: `7c1d2e3f-4a5b-4c6d-8e9f-${String(index).padStart(12, "0")}`,
    title,
    description: "",
    category: "homework",
    deadlineDate: date,
    deadlineAt: `${date}T22:59:00.000Z`,
    ...extra,
  };
}

function givenFamily(children: unknown[], events: unknown[]): ApiCall[] {
  return stubApi(({ method, url }) => {
    if (url.pathname === "/children") return json(children);
    if (url.pathname === "/events" && method === "GET") {
      if (url.searchParams.get("status") === "needs_review") return json({ items: [] });
      return json({ items: events });
    }
    if (url.pathname === "/sync") return json({ status: "requested" }, 202);
    return undefined;
  });
}

function eventRequests(calls: ApiCall[]): URLSearchParams[] {
  return calls
    .filter((call) => call.method === "GET" && call.url.pathname === "/events")
    .map((call) => call.url.searchParams);
}

function at(instant: string): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(instant));
}

describe("Accueil, the family week", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("Semaine groups the next 7 days by day", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenFamily(
      [CHILD],
      [
        deadline(1, "2026-11-12", "Lire le chapitre 2"),
        deadline(2, "2026-11-13", "Piscine du vendredi", { category: "swimming" }),
        deadline(3, "2026-11-18", "Contrôle de grammaire", { category: "assessment" }),
        deadline(4, "2026-11-21", "Exposé sur les volcans"),
      ],
    );
    await renderAppAt("/");

    const days = await screen.findByRole("radiogroup", { name: "Jours de la semaine" });
    const items = within(days).getAllByRole("radio");

    expect(items).toHaveLength(7);
    expect(items[0]?.getAttribute("aria-label")).toBe("Aujourd'hui, 1 échéance");
    expect(items[1]?.getAttribute("aria-label")).toBe("Demain, 1 échéance");
    expect(items[2]?.getAttribute("aria-label")).toBe("Samedi 14 novembre, aucune échéance");
    expect(await screen.findByText("Lire le chapitre 2")).toBeDefined();

    fireEvent.click(items[6] as HTMLElement);

    expect(await screen.findByText("Contrôle de grammaire")).toBeDefined();
    expect(screen.queryByText("Lire le chapitre 2")).toBeNull();
    expect(screen.queryByText("Exposé sur les volcans")).toBeNull();
  });

  it("family row filters every list and is remembered", async () => {
    const calls = givenFamily(
      [CHILD, HUGO],
      [
        deadline(1, "2026-11-13", "Piscine de Léa", { category: "swimming" }),
        deadline(2, "2026-11-13", "Dictée de Hugo", { childId: HUGO.id }),
      ],
    );
    at("2026-11-12T09:00:00.000Z");
    await renderAppAt("/");

    const family = await screen.findByRole("toolbar", { name: "Filtrer par enfant" });
    fireEvent.click(within(family).getByRole("button", { name: /Hugo/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Demain, 1 échéance" }));

    expect(await screen.findByText("Dictée de Hugo")).toBeDefined();
    expect(screen.queryByText("Piscine de Léa")).toBeNull();

    cleanup();
    resetApp();
    const again = givenFamily([CHILD, HUGO], []);
    await renderAppAt("/?tab=upcoming");

    const remembered = await screen.findByRole("toolbar", { name: "Filtrer par enfant" });
    expect(within(remembered).getByRole("button", { name: /Hugo/ }).ariaPressed).toBe("true");
    await waitFor(() =>
      expect(eventRequests(again).some((query) => query.get("childId") === HUGO.id)).toBe(true),
    );
    expect(eventRequests(calls).some((query) => query.get("childId") === HUGO.id)).toBe(true);
  });

  it("Sunday after 16:00 shows Préparer la semaine", async () => {
    at("2026-11-15T16:30:00.000Z");
    givenFamily(
      [CHILD],
      [
        deadline(1, "2026-11-16", "Autorisation de sortie", { category: "document_due" }),
        deadline(2, "2026-11-19", "Piscine", { category: "swimming" }),
      ],
    );
    await renderAppAt("/");

    const prepare = await screen.findByRole("heading", { level: 2, name: "Préparer la semaine" });
    const panel = prepare.closest("section");

    expect(panel?.textContent).toContain("Autorisation de sortie");
    expect(panel?.textContent).toContain("Piscine");
  });

  it("a weekday afternoon does not show Préparer la semaine", async () => {
    at("2026-11-12T16:30:00.000Z");
    givenFamily([CHILD], [deadline(1, "2026-11-13", "Piscine", { category: "swimming" })]);
    await renderAppAt("/");

    await screen.findByRole("radiogroup", { name: "Jours de la semaine" });
    expect(screen.queryByRole("heading", { name: "Préparer la semaine" })).toBeNull();
  });

  it("a failing week page is not fetched again until the parent retries", async () => {
    at("2026-11-12T09:00:00.000Z");
    const calls = stubApi(({ method, url }) => {
      if (url.pathname === "/children") return json([CHILD]);
      if (url.pathname !== "/events" || method !== "GET") return undefined;
      if (url.searchParams.get("status") === "needs_review") return json({ items: [] });
      if (url.searchParams.get("cursor") === "page-2") return json({ code: "RATE_LIMITED" }, 429);
      return json({ items: [deadline(1, "2026-11-13", "Piscine")], nextCursor: "page-2" });
    });
    const secondPage = () =>
      eventRequests(calls).filter((query) => query.get("cursor") === "page-2").length;
    await renderAppAt("/");

    await screen.findByRole("button", { name: "Réessayer" }, { timeout: 4000 });
    const afterFailure = secondPage();
    await new Promise((resolve) => setTimeout(resolve, 2500));

    expect(afterFailure).toBeGreaterThan(0);
    expect(secondPage()).toBe(afterFailure);
  }, 10_000);

  it("À vérifier on Semaine ignores a category picked on À venir", async () => {
    at("2026-11-12T09:00:00.000Z");
    const calls = givenFamily([CHILD], []);
    await renderAppAt("/?category=swimming");

    await screen.findByRole("radiogroup", { name: "Jours de la semaine" });
    await waitFor(() =>
      expect(
        eventRequests(calls).filter((query) => query.get("status") === "needs_review"),
      ).not.toHaveLength(0),
    );
    const reviews = eventRequests(calls).filter((query) => query.get("status") === "needs_review");
    expect(reviews.every((query) => query.get("category") === null)).toBe(true);
  });

  it("Ce soir lists what to prepare for tomorrow", async () => {
    at("2026-11-12T17:00:00.000Z");
    givenFamily([CHILD], [deadline(1, "2026-11-13", "Piscine", { category: "swimming" })]);
    await renderAppAt("/");

    const tonight = await screen.findByRole("region", { name: "Ce soir" });

    expect(within(tonight).getByRole("checkbox", { name: "Maillot de bain" })).toBeDefined();
    fireEvent.click(within(tonight).getByRole("checkbox", { name: "Serviette" }));
    expect(
      within(tonight).getByRole("checkbox", { name: "Serviette" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("the week can be shared on any day", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenFamily([CHILD], [deadline(1, "2026-11-13", "Piscine", { category: "swimming" })]);
    await renderAppAt("/");

    expect(await screen.findByRole("button", { name: "Partager la semaine" })).toBeDefined();
  });

  it("Sunday lists what to sign and what to buy or prepare", async () => {
    at("2026-11-15T16:30:00.000Z");
    givenFamily(
      [CHILD],
      [
        deadline(1, "2026-11-16", "Autorisation de sortie", { category: "document_due" }),
        deadline(2, "2026-11-19", "Piscine", { category: "swimming" }),
      ],
    );
    await renderAppAt("/");

    const sign = await screen.findByRole("region", { name: "À signer" });
    const prepare = screen.getByRole("region", { name: "À acheter ou préparer" });

    expect(sign.textContent).toContain("Autorisation de sortie");
    expect(sign.textContent).not.toContain("Piscine");
    expect(prepare.textContent).toContain("Maillot de bain");
    expect(prepare.textContent).not.toContain("Signer le document");
  });

  it("Accueil switches to Préparer la semaine at 16:00 on Sunday without a reload", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-11-15T14:59:30.000Z"));
    givenFamily([CHILD], [deadline(1, "2026-11-16", "Piscine", { category: "swimming" })]);
    await renderAppAt("/");

    await screen.findByRole("radiogroup", { name: "Jours de la semaine" });
    expect(screen.queryByRole("heading", { name: "Préparer la semaine" })).toBeNull();

    act(() => {
      vi.setSystemTime(new Date("2026-11-15T15:00:30.000Z"));
      vi.advanceTimersByTime(60_000);
    });

    expect(await screen.findByRole("heading", { name: "Préparer la semaine" })).toBeDefined();
  });
});
