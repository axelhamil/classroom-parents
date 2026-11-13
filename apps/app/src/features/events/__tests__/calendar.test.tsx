// @vitest-environment jsdom
import { shiftDate } from "@packages/ddd-kit/days";
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

  it("opens on the seven days ahead, the briefing holding today and the rows the six days after", async () => {
    at("2026-11-12T06:30:00.000Z");
    givenCalendar([CHILD], [deadline(1, "2026-11-13", "Sac de piscine", { category: "swimming" })]);
    await renderAppAt("/");

    const tabs = await screen.findByRole("tablist", { name: "Vue des échéances" });
    expect(
      within(tabs)
        .getAllByRole("tab")
        .map((tab) => [tab.textContent, tab.getAttribute("aria-selected")]),
    ).toEqual([
      ["Semaine", "true"],
      ["Mois", "false"],
    ]);
    expect(
      await screen.findByRole("heading", { level: 2, name: "Du 12 au 18 novembre" }),
    ).toBeDefined();
    await waitFor(() =>
      expect(
        [...document.querySelectorAll("[data-slot=calendar-day-title]")].map(
          (title) => title.textContent,
        ),
      ).toEqual([
        "Demain",
        "Samedi 14 novembre",
        "Dimanche 15 novembre",
        "Lundi 16 novembre",
        "Mardi 17 novembre",
        "Mercredi 18 novembre",
      ]),
    );
    expect(within(day("Demain")).getByText("Sac de piscine")).toBeDefined();
    expect(screen.getByRole("region", { name: "Pour aujourd'hui" })).toBeDefined();
    expect(within(day("Samedi 14 novembre")).getByText("Rien de prévu")).toBeDefined();
    expect(screen.getByRole("button", { name: "Aujourd'hui" }).hasAttribute("disabled")).toBe(true);
  });

  it("a week across two months names both in its title", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenCalendar([CHILD], []);
    await renderAppAt("/?date=2026-11-28");

    expect(
      await screen.findByRole("heading", { level: 2, name: "Du 28 novembre au 4 décembre" }),
    ).toBeDefined();
  });

  it("after 16:00 the briefing frames the evening and the calendar keeps calling today Aujourd'hui", async () => {
    at("2026-11-12T17:00:00.000Z");
    givenCalendar([CHILD], [deadline(1, "2026-11-13", "Piscine", { category: "swimming" })]);
    await renderAppAt("/");

    expect(await screen.findByRole("region", { name: "Pour demain" })).toBeDefined();
    expect(await screen.findByRole("heading", { level: 3, name: "Aujourd'hui" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Ce soir" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Préparer la semaine" })).toBeNull();
  });

  it("asks the range query for exactly the visible period of each view", async () => {
    at("2026-11-12T09:00:00.000Z");
    const week = givenCalendar([CHILD], []);
    await renderAppAt("/");
    await waitFor(() =>
      expect(calendarRequests(week.calls)).toContainEqual({
        from: "2026-11-12",
        to: "2026-11-18",
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

  it("the week strip flags a crunch day and a day picked there takes the focus to its row", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenCalendar(FIVE_CHILDREN, crunchDay("2026-11-13", 15));
    const router = await renderAppAt("/");

    const strip = await screen.findByRole("radiogroup", { name: "Jours de la semaine" });
    expect(within(strip).getAllByRole("radio")).toHaveLength(7);
    const friday = within(strip).getByRole("radio", { name: /^Demain, 15 échéances/ });
    expect(friday.getAttribute("aria-label")).toContain("journée chargée");

    fireEvent.click(friday);

    await waitFor(() => expect(document.activeElement).toBe(day("Demain")));
    expect(search(router).date).toBeUndefined();
  });

  it("the strip sends the day the briefing covers to the briefing", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenCalendar([CHILD], [deadline(1, "2026-11-12", "Piscine", { category: "swimming" })]);
    await renderAppAt("/");

    const strip = await screen.findByRole("radiogroup", { name: "Jours de la semaine" });
    fireEvent.click(within(strip).getByRole("radio", { name: /^Aujourd'hui, 1 échéance/ }));

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("region", { name: "Pour aujourd'hui" })),
    );
  });

  it("a crowded day lists every deadline, none folded behind a count", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenCalendar(FIVE_CHILDREN, crunchDay("2026-11-13", 15));
    await renderAppAt("/");

    const friday = await waitFor(() => day("Demain"));
    await waitFor(() => expect(within(friday).getAllByRole("link")).toHaveLength(15));
    expect(within(friday).getByText(STRESS.title120)).toBeDefined();
    expect(within(friday).getByText("Journée chargée")).toBeDefined();
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
    expect(screen.queryByText("Rien de prévu")).toBeNull();
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

  it("late deadlines wait folded in one line that opens them in an overlay, never in place", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenCalendar(
      [CHILD, HUGO],
      [
        deadline(1, "2026-11-10", "Cahier de liaison à signer", { childId: HUGO.id }),
        deadline(2, "2026-11-09", "Fiche déjà rendue", { done: true }),
        deadline(3, "2026-11-13", "Piscine"),
      ],
    );
    await renderAppAt("/");

    const line = await screen.findByRole("button", { name: "En retard, 1 échéance" });
    expect(line.getAttribute("aria-haspopup")).toBe("dialog");
    line.focus();
    fireEvent.click(line);

    const overdue = await screen.findByRole("dialog", { name: "En retard, 1 échéance" });
    expect(document.querySelector("main")?.contains(overdue)).toBe(false);
    expect(within(overdue).getByText("Sur les 14 derniers jours")).toBeDefined();
    expect(within(overdue).getByRole("heading", { name: "Mardi 10 novembre" })).toBeDefined();
    expect(within(overdue).getByRole("link", { name: "Cahier de liaison à signer" })).toBeDefined();
    expect(within(overdue).getByText("Hugo")).toBeDefined();
    expect(within(overdue).queryByText("En retard")).toBeNull();
    expect(within(overdue).queryByText("Fiche déjà rendue")).toBeNull();
    expect(within(overdue).queryByText("Piscine")).toBeNull();

    fireEvent.click(within(overdue).getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(line));
  });

  it("a late deadline ticked in the overlay stays there, done and focused, until it closes", async () => {
    at("2026-11-12T09:00:00.000Z");
    const stub = givenCalendar([CHILD], [deadline(1, "2026-11-10", "Cahier de liaison à signer")]);
    await renderAppAt("/");

    fireEvent.click(await screen.findByRole("button", { name: "En retard, 1 échéance" }));
    const overdue = await screen.findByRole("dialog", { name: "En retard, 1 échéance" });
    const tick = within(overdue).getByRole("checkbox", {
      name: "Marquer comme fait : Cahier de liaison à signer",
    });
    tick.focus();
    fireEvent.click(tick);

    await waitFor(() =>
      expect(
        stub.calls.some((call) => call.method === "POST" && call.url.pathname.endsWith("/done")),
      ).toBe(true),
    );
    await waitFor(() => expect(tick.getAttribute("aria-checked")).toBe("true"));
    expect(tick.isConnected).toBe(true);
    expect(document.activeElement).toBe(tick);
    expect(within(overdue).getByRole("link", { name: "Cahier de liaison à signer" })).toBeDefined();

    fireEvent.click(within(overdue).getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: /^En retard/ })).toBeNull();
  });

  it("a done tick says so in a toast that undoes it", async () => {
    at("2026-11-12T09:00:00.000Z");
    const stub = givenCalendar([CHILD], [deadline(1, "2026-11-14", "Sac de piscine")]);
    await renderAppAt("/");

    const tick = await screen.findByRole("checkbox", {
      name: "Marquer comme fait : Sac de piscine",
    });
    fireEvent.click(tick);
    fireEvent.click(await screen.findByRole("button", { name: "Annuler" }));

    await waitFor(() =>
      expect(
        stub.calls.some((call) => call.method === "DELETE" && call.url.pathname.endsWith("/done")),
      ).toBe(true),
    );
    await waitFor(() => expect(tick.getAttribute("aria-checked")).toBe("false"));
  });

  it("the line counts every late deadline of the last 14 days, past a page of 50", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenCalendar(
      [CHILD],
      Array.from({ length: 60 }, (_, index) =>
        deadline(index + 1, shiftDate("2026-11-11", -(index % 11)), `Retard ${index + 1}`),
      ),
    );
    await renderAppAt("/");

    fireEvent.click(await screen.findByRole("button", { name: "En retard, 60 échéances" }));

    const overdue = await screen.findByRole("dialog", { name: "En retard, 60 échéances" });
    expect(within(overdue).getAllByRole("link")).toHaveLength(60);
    expect(within(overdue).getAllByRole("heading", { level: 3 })).toHaveLength(11);
  });

  it("a deadline late by more than 14 days leaves the line for past deadlines", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenCalendar([CHILD], [deadline(1, "2026-10-28", "Autorisation de septembre")]);
    await renderAppAt("/");

    await screen.findByRole("tablist", { name: "Vue des échéances" });
    await waitFor(() => expect(screen.queryByText("Autorisation de septembre")).toBeNull());
    expect(screen.queryByRole("button", { name: /^En retard/ })).toBeNull();
  });

  it("a late deadline of a past week the parent goes back to stays on its day, not in the line", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenCalendar([CHILD], [deadline(1, "2026-11-10", "Cahier de liaison à signer")]);
    await renderAppAt("/?date=2026-11-09");

    const tuesday = await waitFor(() => day("Mardi 10 novembre"));
    expect(
      await within(tuesday).findByRole("link", { name: "Cahier de liaison à signer" }),
    ).toBeDefined();
    expect(within(tuesday).getByText("En retard")).toBeDefined();
    expect(screen.queryByRole("button", { name: /^En retard/ })).toBeNull();
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
