// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, renderAppAt, resetApp } from "../../../__tests__/app-harness";
import {
  calendarRequests,
  crunchDay,
  FIVE_CHILDREN,
  givenCalendar,
  STRESS,
} from "../../../__tests__/calendar-fixtures";
import { CHILD } from "../../../__tests__/family-fixtures";
import { at, deadline, HUGO } from "../../../__tests__/week-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
}));

function search(router: Awaited<ReturnType<typeof renderAppAt>>): Record<string, unknown> {
  return router.state.location.search;
}

function day(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { level: 3, name });
  const section = heading.closest("[data-slot=calendar-day]");
  if (!(section instanceof HTMLElement)) throw new Error(`no day section for ${name}`);

  return section;
}

describe("Accueil, the family calendar", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("opens on today: Agenda starts on today and Aujourd'hui has nowhere to go", async () => {
    at("2026-11-12T06:30:00.000Z");
    givenCalendar([CHILD], [deadline(1, "2026-11-13", "Sac de piscine", { category: "swimming" })]);
    await renderAppAt("/");

    const tabs = await screen.findByRole("tablist", { name: "Vue des échéances" });
    expect(within(tabs).getByRole("tab", { name: "Agenda" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    const headings = await screen.findAllByRole("heading", { level: 3 });
    expect(headings[0]?.textContent).toBe("Aujourd'hui");
    expect(within(day("Demain")).getByText("Sac de piscine")).toBeDefined();
    expect(screen.getByRole("button", { name: "Aujourd'hui" }).hasAttribute("disabled")).toBe(true);
  });

  it("calls today Ce soir after 16:00, the old Ce soir card folded into the calendar", async () => {
    at("2026-11-12T17:00:00.000Z");
    givenCalendar([CHILD], [deadline(1, "2026-11-13", "Piscine", { category: "swimming" })]);
    await renderAppAt("/");

    expect(await screen.findByRole("heading", { level: 3, name: "Ce soir" })).toBeDefined();
    expect(screen.getAllByRole("heading", { name: "Ce soir" })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Préparer la semaine" })).toBeNull();
  });

  it("asks the range query for exactly the visible period of each view", async () => {
    at("2026-11-12T09:00:00.000Z");
    const agenda = givenCalendar([CHILD], []);
    await renderAppAt("/");
    await waitFor(() =>
      expect(calendarRequests(agenda.calls)).toContainEqual({
        from: "2026-11-12",
        to: "2026-11-25",
      }),
    );

    cleanup();
    resetApp();
    const month = givenCalendar([CHILD], []);
    await renderAppAt("/?view=month&date=2026-12-03");
    await waitFor(() =>
      expect(calendarRequests(month.calls)).toContainEqual({
        from: "2026-11-30",
        to: "2027-01-10",
      }),
    );
    expect(await screen.findByRole("heading", { level: 2, name: "décembre 2026" })).toBeDefined();
  });

  it("switching views keeps the date in the url", async () => {
    at("2026-11-12T09:00:00.000Z");
    const stub = givenCalendar([CHILD], []);
    const router = await renderAppAt("/?view=week&date=2026-12-03");

    const tabs = await screen.findByRole("tablist", { name: "Vue des échéances" });
    fireEvent.mouseDown(within(tabs).getByRole("tab", { name: "Mois" }));

    await waitFor(() =>
      expect(search(router)).toMatchObject({ view: "month", date: "2026-12-03" }),
    );
    await waitFor(() =>
      expect(calendarRequests(stub.calls)).toContainEqual({ from: "2026-11-30", to: "2027-01-10" }),
    );
  });

  it("moves by a whole period and comes back to today", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenCalendar([CHILD], []);
    const router = await renderAppAt("/?view=week");

    fireEvent.click(await screen.findByRole("button", { name: "Période suivante" }));
    await waitFor(() => expect(search(router)).toMatchObject({ date: "2026-11-19" }));
    const today = screen.getByRole("button", { name: "Aujourd'hui" });
    expect(today.hasAttribute("disabled")).toBe(false);

    fireEvent.click(today);
    await waitFor(() => expect(search(router).date).toBeUndefined());
  });

  it("the done toggle ticks the row at once and rolls back when the server refuses", async () => {
    at("2026-11-12T09:00:00.000Z");
    let refuse: (response: Response) => void = () => undefined;
    const failDone = new Promise<Response>((resolve) => {
      refuse = resolve;
    });
    givenCalendar([CHILD], [deadline(1, "2026-11-13", "Lire le chapitre 2")], { failDone });
    await renderAppAt("/");

    const check = await screen.findByRole("checkbox", {
      name: "Marquer comme fait : Lire le chapitre 2",
    });
    fireEvent.click(check);

    await waitFor(() => expect(check.getAttribute("aria-checked")).toBe("true"));

    refuse(json({ code: "INTERNAL" }, 500));

    await waitFor(() => expect(check.getAttribute("aria-checked")).toBe("false"));
    expect(await screen.findByText("Échec de la mise à jour de l'échéance")).toBeDefined();
  });

  it("a deadline added from a day lands on that day", async () => {
    at("2026-11-12T09:00:00.000Z");
    const stub = givenCalendar([CHILD], [deadline(1, "2026-11-13", "Piscine")]);
    await renderAppAt("/");

    fireEvent.click(
      await screen.findByRole("button", { name: "Ajouter une échéance pour demain" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Nouvelle échéance" });
    fireEvent.change(within(dialog).getByLabelText("Titre"), {
      target: { value: "Rendez-vous orthophoniste" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ajouter" }));

    await waitFor(() =>
      expect(
        stub.calls.find((call) => call.method === "POST" && call.url.pathname === "/events")?.body,
      ).toMatchObject({
        childId: CHILD.id,
        title: "Rendez-vous orthophoniste",
        deadlineDate: "2026-11-13",
      }),
    );
    await waitFor(() =>
      expect(within(day("Demain")).getByText("Rendez-vous orthophoniste")).toBeDefined(),
    );
    expect(await screen.findByText("Échéance ajoutée")).toBeDefined();
  });

  it("the child filter hides the other children's events and is remembered", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenCalendar(
      [CHILD, HUGO],
      [
        deadline(1, "2026-11-13", "Piscine de Léa", { category: "swimming" }),
        deadline(2, "2026-11-13", "Dictée de Hugo", { childId: HUGO.id }),
      ],
    );
    const router = await renderAppAt("/");

    const family = await screen.findByRole("toolbar", { name: "Filtrer par enfant" });
    fireEvent.click(within(family).getByRole("button", { name: /Hugo/ }));

    await waitFor(() => expect(screen.queryByText("Piscine de Léa")).toBeNull());
    expect(screen.getByText("Dictée de Hugo")).toBeDefined();
    expect(search(router)).toMatchObject({ childId: HUGO.id });

    cleanup();
    resetApp();
    givenCalendar([CHILD, HUGO], [deadline(1, "2026-11-13", "Piscine de Léa")]);
    await renderAppAt("/");

    const remembered = await screen.findByRole("toolbar", { name: "Filtrer par enfant" });
    expect(within(remembered).getByRole("button", { name: /Hugo/ }).ariaPressed).toBe("true");
    expect(screen.queryByText("Piscine de Léa")).toBeNull();
  });

  it("the week ribbon flags a crunch day and selecting a day keeps it in the url", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenCalendar(FIVE_CHILDREN, crunchDay("2026-11-13", 15));
    const router = await renderAppAt("/?view=week");

    const ribbon = await screen.findByRole("radiogroup", { name: "Jours de la semaine" });
    const friday = within(ribbon).getByRole("radio", { name: /^Demain, 15 échéances/ });
    expect(friday.getAttribute("aria-label")).toContain("journée chargée");

    fireEvent.click(friday);
    await waitFor(() => expect(search(router)).toMatchObject({ date: "2026-11-13" }));
    expect(await screen.findByText(STRESS.title120)).toBeDefined();
  });

  it("a crowded week column shows four stickers and its +N opens the whole day", async () => {
    at("2026-11-12T09:00:00.000Z");
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    givenCalendar(FIVE_CHILDREN, crunchDay("2026-11-13", 15));
    const router = await renderAppAt("/?view=week");

    const friday = await screen.findByLabelText(/^Demain, 15 échéances/);
    expect(within(friday).getAllByRole("link")).toHaveLength(4);

    fireEvent.click(
      within(friday).getByRole("button", { name: "+11 : voir toute la journée, demain" }),
    );
    await waitFor(() =>
      expect(search(router)).toMatchObject({ view: "agenda", date: "2026-11-13" }),
    );
  });

  it("Mois marks a crunch day and lists the picked day under the grid", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenCalendar(FIVE_CHILDREN, [...crunchDay("2026-11-13", 15), STRESS.pastDue("2026-11-10")]);
    const router = await renderAppAt("/?view=month");

    const grid = await screen.findByRole("grid");
    const crunch = within(grid).getByRole("button", { name: /13 novembre.*15 échéances/ });
    expect(crunch.getAttribute("aria-label")).toContain("journée chargée");

    fireEvent.click(within(grid).getByRole("button", { name: /10 novembre/ }));
    await waitFor(() => expect(search(router)).toMatchObject({ date: "2026-11-10" }));
    expect(await screen.findByText("Cahier de liaison à signer")).toBeDefined();
    expect(screen.getByText("En retard")).toBeDefined();
  });

  it("an empty period says so, jumps to the next deadline, offers to add and shows the last read", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenCalendar([CHILD], [deadline(1, "2027-01-15", "Sortie au musée")]);
    const router = await renderAppAt("/?view=week&date=2026-12-03");

    expect(await screen.findByText("Rien de prévu sur cette période.")).toBeDefined();
    expect(screen.queryByText("Rien de prévu ce jour-là.")).toBeNull();
    expect(screen.getByText(/^Dernière lecture de Classroom : /)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Ajouter une échéance" }));
    const dialog = await screen.findByRole("dialog", { name: "Nouvelle échéance" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Prochaine échéance : Sortie au musée, vendredi 15 janvier 2027",
      }),
    );
    await waitFor(() => expect(search(router)).toMatchObject({ date: "2027-01-15" }));
    expect(await screen.findByText("Sortie au musée")).toBeDefined();
  });

  it("open deadlines the period hides are surfaced as En retard and leave once done", async () => {
    at("2026-11-12T09:00:00.000Z");
    const stub = givenCalendar(
      [CHILD, HUGO],
      [
        deadline(1, "2026-11-10", "Cahier de liaison à signer", { childId: HUGO.id }),
        deadline(2, "2026-11-09", "Fiche déjà rendue", { done: true }),
        deadline(3, "2026-11-13", "Piscine"),
      ],
    );
    await renderAppAt("/");

    const overdue = await screen.findByRole("region", { name: "En retard" });
    expect(within(overdue).getByRole("link", { name: "Cahier de liaison à signer" })).toBeDefined();
    expect(within(overdue).getByText("Hugo")).toBeDefined();
    expect(within(overdue).getByText("Mardi 10 novembre")).toBeDefined();
    expect(within(overdue).queryByText("Fiche déjà rendue")).toBeNull();
    expect(within(overdue).queryByText("Piscine")).toBeNull();

    fireEvent.click(
      within(overdue).getByRole("checkbox", {
        name: "Marquer comme fait : Cahier de liaison à signer",
      }),
    );
    await waitFor(() =>
      expect(
        stub.calls.some((call) => call.method === "POST" && call.url.pathname.endsWith("/done")),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.queryByRole("region", { name: "En retard" })).toBeNull());
  });

  it("a long backlog shows the three latest and opens the rest on demand", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenCalendar(
      [CHILD],
      ["2026-11-11", "2026-11-10", "2026-11-09", "2026-11-06", "2026-11-05"].map((date, index) =>
        deadline(index + 1, date, `Retard ${index + 1}`),
      ),
    );
    await renderAppAt("/");

    const overdue = await screen.findByRole("region", { name: "En retard" });
    await waitFor(() => expect(within(overdue).getAllByRole("link")).toHaveLength(3));
    expect(within(overdue).queryByText("Retard 4")).toBeNull();

    fireEvent.click(
      within(overdue).getByRole("button", { name: "Voir les 2 autres échéances en retard" }),
    );
    expect(within(overdue).getAllByRole("link")).toHaveLength(5);
  });

  it("no strip when nothing is late, and a late day the week shows stays on its day", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenCalendar([CHILD], [deadline(1, "2026-11-10", "Cahier de liaison à signer")]);
    await renderAppAt("/?view=week");

    expect(await screen.findByRole("radiogroup", { name: "Jours de la semaine" })).toBeDefined();
    await waitFor(() => expect(screen.queryByRole("region", { name: "En retard" })).toBeNull());
  });

  it("closing a deadline opened from the calendar gives focus back to its row", async () => {
    at("2026-11-12T09:00:00.000Z");
    const homework = deadline(1, "2026-11-13", "Lire le chapitre 2");
    givenCalendar([CHILD], [homework], { detail: homework });
    await renderAppAt("/");

    const opener = await within(await waitFor(() => day("Demain"))).findByRole("link", {
      name: "Lire le chapitre 2",
    });
    opener.focus();
    fireEvent.click(opener);
    const detail = await screen.findByRole("dialog");
    fireEvent.click(within(detail).getAllByRole("button", { name: "Fermer" })[0] as HTMLElement);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("the more menu offers to share, print, subscribe and see past deadlines", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenCalendar([CHILD], []);
    await renderAppAt("/");

    fireEvent.pointerDown(await screen.findByRole("button", { name: "Plus d'actions" }), {
      button: 0,
      ctrlKey: false,
    });
    const menu = await screen.findByRole("menu");
    for (const name of [
      "Partager la semaine",
      "Imprimer la semaine",
      "S'abonner au calendrier",
      "Échéances passées",
    ])
      expect(within(menu).getByRole("menuitem", { name })).toBeDefined();
  });
});
