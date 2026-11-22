// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderAppAt, resetApp } from "../../../__tests__/app-harness";
import { givenCalendar } from "../../../__tests__/calendar-fixtures";
import { CHILD } from "../../../__tests__/family-fixtures";
import { at, deadline } from "../../../__tests__/week-fixtures";

const THURSDAY_MORNING = "2026-11-12T09:00:00.000Z";
const THURSDAY_EVENING = "2026-11-12T19:00:00.000Z";

function block(name: string): Promise<HTMLElement> {
  return screen.findByRole("region", { name });
}

function emptyStateOf(region: HTMLElement): HTMLElement | null {
  return region.querySelector("[data-slot=dashboard-panel-empty]");
}

describe("an empty home block says something useful at its size", () => {
  afterEach(() => {
    cleanup();
    resetApp();
  });

  it("given no assessment in two weeks but one later, then the block names the next one and links to it", async () => {
    at(THURSDAY_MORNING);
    const history = deadline(1, "2026-12-02", "Évaluation d'histoire", { category: "assessment" });
    givenCalendar([CHILD], [history], {
      homeLayout: [{ id: "assessments", w: 2, h: 1 }],
    });
    await renderAppAt("/");

    const assessments = await block("Contrôles à réviser");
    const next = await within(assessments).findByRole("link", {
      name: "Prochain contrôle : Évaluation d'histoire, mercredi 2 décembre",
    });

    expect(next.getAttribute("href")).toBe(`/events/${history.id}`);
    expect(within(assessments).getByText("Aucun contrôle d'ici 14 jours")).toBeDefined();
    expect(emptyStateOf(assessments)).not.toBeNull();
  });

  it("given nothing to bring back at all, then the block says so with what will land there", async () => {
    at(THURSDAY_MORNING);
    givenCalendar([CHILD], []);
    await renderAppAt("/");

    const documents = await block("À signer, à rendre");

    expect(await within(documents).findByText("Rien à rendre d'ici 14 jours")).toBeDefined();
    expect(
      within(documents).getByText("Une autorisation ou un document à rapporter arrivera ici."),
    ).toBeDefined();
    expect(within(documents).queryByRole("link")).toBeNull();
  });

  it("given nothing due tomorrow evening, then Pour ce soir links to the next deadline", async () => {
    at(THURSDAY_EVENING);
    const talk = deadline(1, "2026-11-17", "Exposé");
    givenCalendar([CHILD], [talk], {
      homeLayout: [{ id: "tonight", w: 2, h: 1 }],
    });
    await renderAppAt("/");

    const tonight = await block("Pour ce soir");
    const next = await within(tonight).findByRole("link", {
      name: "Prochaine échéance : Exposé, mardi 17 novembre",
    });

    expect(next.getAttribute("href")).toBe(`/events/${talk.id}`);
    expect(within(tonight).getByText("Rien de prévu demain")).toBeDefined();
  });

  it("given an empty block, then its empty state never repeats the block title as a lone line", async () => {
    at(THURSDAY_MORNING);
    givenCalendar([CHILD], []);
    await renderAppAt("/");

    const overdue = await block("En retard");
    await within(overdue).findByText("Rien en retard, bravo");

    expect(emptyStateOf(overdue)?.querySelectorAll("p")).toHaveLength(2);
    expect(overdue.querySelector("[data-slot=dashboard-panel-note]")).toBeNull();
  });
});
