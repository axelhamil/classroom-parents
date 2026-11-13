// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, renderAppAt, resetApp } from "../../../__tests__/app-harness";
import { givenCalendar } from "../../../__tests__/calendar-fixtures";
import { CHILD } from "../../../__tests__/family-fixtures";
import { at, deadline, HUGO } from "../../../__tests__/week-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
}));

const THURSDAY_MORNING = "2026-11-12T06:30:00.000Z";
const THURSDAY_EVENING = "2026-11-12T17:00:00.000Z";
const FRIDAY_EVENING = "2026-11-13T18:00:00.000Z";

async function briefing(name: string): Promise<HTMLElement> {
  return screen.findByRole("region", { name });
}

function titlesIn(region: HTMLElement): string[] {
  return within(region)
    .queryAllByRole("link")
    .map((link) => link.textContent ?? "");
}

describe("Accueil briefs the next school moment", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("before 16:00 it is about today", async () => {
    at(THURSDAY_MORNING);
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-12", "Fiche de sortie signée"),
        deadline(2, "2026-11-13", "Sac de piscine", { category: "swimming" }),
      ],
    );
    await renderAppAt("/");

    const today = await briefing("Pour aujourd'hui");
    await waitFor(() => expect(titlesIn(today)).toEqual(["Fiche de sortie signée"]));
  });

  it("after 16:00 it is about the next school day, with tonight's leftovers still open", async () => {
    at(THURSDAY_EVENING);
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-12", "Exercice en ligne"),
        deadline(2, "2026-11-12", "Fiche déjà rendue", { done: true }),
        deadline(3, "2026-11-13", "Sac de piscine", { category: "swimming" }),
        deadline(4, "2026-11-16", "Exposé"),
      ],
    );
    await renderAppAt("/");

    const tomorrow = await briefing("Pour demain");
    await waitFor(() =>
      expect(titlesIn(tomorrow)).toEqual(["Exercice en ligne", "Sac de piscine"]),
    );
    expect(screen.queryByRole("heading", { name: "Ce soir" })).toBeNull();
  });

  it("on Friday evening it is about Monday, a weekend outing included", async () => {
    at(FRIDAY_EVENING);
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-14", "Match de hand"),
        deadline(2, "2026-11-16", "Cahier de liaison signé"),
        deadline(3, "2026-11-17", "Évaluation de calcul"),
      ],
    );
    await renderAppAt("/");

    const monday = await briefing("Pour lundi 16 novembre");
    await waitFor(() =>
      expect(titlesIn(monday)).toEqual(["Match de hand", "Cahier de liaison signé"]),
    );
  });

  it("groups what is due per child, in the family order", async () => {
    at(THURSDAY_EVENING);
    givenCalendar(
      [CHILD, HUGO],
      [
        deadline(1, "2026-11-13", "Fiche à signer", { childId: HUGO.id }),
        deadline(2, "2026-11-13", "Sac de piscine", { category: "swimming" }),
      ],
    );
    await renderAppAt("/");

    const tomorrow = await briefing("Pour demain");
    const lea = await within(tomorrow).findByRole("region", { name: "Léa" });
    const hugo = within(tomorrow).getByRole("region", { name: "Hugo" });
    expect(titlesIn(lea)).toEqual(["Sac de piscine"]);
    expect(titlesIn(hugo)).toEqual(["Fiche à signer"]);
    expect(
      within(tomorrow)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["Léa", "Hugo"]);
    expect(within(tomorrow).getByText("Encore 2 échéances à boucler")).toBeDefined();
  });

  it("ticks done at once and rolls back when the server refuses", async () => {
    at(THURSDAY_EVENING);
    let refuse: (response: Response) => void = () => undefined;
    givenCalendar([CHILD], [deadline(1, "2026-11-13", "Fiche à signer")], {
      failDone: new Promise<Response>((resolve) => {
        refuse = resolve;
      }),
    });
    await renderAppAt("/");

    const tomorrow = await briefing("Pour demain");
    const check = await within(tomorrow).findByRole("checkbox", {
      name: "Marquer comme fait : Fiche à signer",
    });
    fireEvent.click(check);
    await waitFor(() => expect(check.getAttribute("aria-checked")).toBe("true"));

    refuse(json({ code: "INTERNAL" }, 500));
    await waitFor(() => expect(check.getAttribute("aria-checked")).toBe("false"));
    expect(await screen.findByText("Échec de la mise à jour de l'échéance")).toBeDefined();
  });

  it("lists what to prepare under an open item, ticked from the briefing", async () => {
    at(THURSDAY_EVENING);
    const stub = givenCalendar(
      [CHILD],
      [deadline(1, "2026-11-13", "Sac de piscine", { category: "swimming" })],
    );
    await renderAppAt("/");

    const tomorrow = await briefing("Pour demain");
    const swimsuit = await within(tomorrow).findByRole("checkbox", { name: "Maillot de bain" });
    fireEvent.click(swimsuit);

    await waitFor(() => expect(swimsuit.getAttribute("aria-checked")).toBe("true"));
    await waitFor(() =>
      expect(
        stub.calls.some(
          (call) => call.method === "POST" && call.url.pathname.endsWith("/checklist"),
        ),
      ).toBe(true),
    );
  });

  it("nothing due reads calm and names the next deadline", async () => {
    at(THURSDAY_EVENING);
    givenCalendar([CHILD], [deadline(1, "2026-11-20", "Sortie au musée")]);
    await renderAppAt("/");

    const tomorrow = await briefing("Pour demain");
    expect(
      await within(tomorrow).findByText(
        "Rien à préparer pour demain. Prochaine échéance : Sortie au musée, vendredi 20 novembre.",
      ),
    ).toBeDefined();
  });

  it("while the first sync runs it says so instead of nothing to prepare", async () => {
    at(THURSDAY_EVENING);
    givenCalendar([{ ...CHILD, lastSyncedAt: null, syncing: true }], []);
    await renderAppAt("/");

    const tomorrow = await briefing("Pour demain");
    expect(await within(tomorrow).findByText("Première lecture de Classroom")).toBeDefined();
    expect(within(tomorrow).queryByText("Rien à préparer pour demain.")).toBeNull();
  });

  it("all done reads ready without a celebration of its own", async () => {
    at(THURSDAY_EVENING);
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-13", "Fiche à signer", { done: true }),
        deadline(2, "2026-11-16", "Exposé"),
      ],
    );
    await renderAppAt("/");

    const tomorrow = await briefing("Pour demain");
    expect(await within(tomorrow).findByText("Tout est prêt pour demain.")).toBeDefined();
    expect(screen.queryByText("Tout est prêt pour demain. Bien joué.")).toBeNull();
  });
});
