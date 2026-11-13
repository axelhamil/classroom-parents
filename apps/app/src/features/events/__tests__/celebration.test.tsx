// @vitest-environment jsdom

import { userStorageKey } from "@packages/web-kit/storage/use-stored-value";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt, resetApp } from "../../../__tests__/app-harness";
import { givenCalendar } from "../../../__tests__/calendar-fixtures";
import { CHILD } from "../../../__tests__/family-fixtures";
import { at, deadline } from "../../../__tests__/week-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
}));

const DAY_DONE = "Tout est prêt pour demain. Bien joué.";
const WEEK_DONE = "Toute la semaine est prête. Profitez de la soirée.";

describe("celebrating a day made ready", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("fires once when the last deadline of the day is marked done", async () => {
    at("2026-11-12T17:30:00.000Z");
    givenCalendar(
      [CHILD],
      [deadline(1, "2026-11-13", "Lire le chapitre 2"), deadline(2, "2026-11-16", "Exposé")],
    );
    await renderAppAt("/");

    const briefing = await screen.findByRole("region", { name: "Pour demain" });
    const check = await within(briefing).findByRole("checkbox", {
      name: "Marquer comme fait : Lire le chapitre 2",
    });
    expect(screen.queryByText(DAY_DONE)).toBeNull();

    fireEvent.click(check);
    expect(await screen.findByText(DAY_DONE)).toBeDefined();
    expect(screen.queryByText(WEEK_DONE)).toBeNull();

    fireEvent.click(check);
    await waitFor(() => expect(check.getAttribute("aria-checked")).toBe("false"));
    fireEvent.click(check);
    await waitFor(() => expect(check.getAttribute("aria-checked")).toBe("true"));
    await waitFor(() => expect(screen.getAllByText(DAY_DONE)).toHaveLength(1));
  });

  it("also fires on the event page a push alert opens, from its done button", async () => {
    at("2026-11-12T17:30:00.000Z");
    const homework = deadline(1, "2026-11-13", "Lire le chapitre 2");
    const path = `/events/${homework.id}`;
    givenCalendar([CHILD], [homework, deadline(2, "2026-11-16", "Exposé")], {
      detail: homework,
    });
    await renderAppAt(path);

    const done = await screen.findByRole("button", { name: "C'est fait" });
    expect(done.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(done);

    await waitFor(() => expect(done.getAttribute("aria-pressed")).toBe("true"));
    expect(await screen.findByText(DAY_DONE)).toBeDefined();
  });

  it("waits for the server: a refused tick celebrates nothing and the next real one still does", async () => {
    at("2026-11-12T17:30:00.000Z");
    givenCalendar(
      [CHILD],
      [deadline(1, "2026-11-13", "Lire le chapitre 2"), deadline(2, "2026-11-16", "Exposé")],
      { refuseFirstDone: true },
    );
    await renderAppAt("/");
    const briefing = await screen.findByRole("region", { name: "Pour demain" });
    const check = await within(briefing).findByRole("checkbox", {
      name: "Marquer comme fait : Lire le chapitre 2",
    });

    fireEvent.click(check);
    await waitFor(() => expect(check.getAttribute("aria-checked")).toBe("false"));
    expect(await screen.findByText("Échec de la mise à jour de l'échéance")).toBeDefined();
    expect(screen.queryByText(DAY_DONE)).toBeNull();
    expect(localStorage.getItem(userStorageKey("user-1", "celebrations"))).toBeNull();

    fireEvent.click(check);
    expect(await screen.findByText(DAY_DONE)).toBeDefined();
  });

  it("never fires when only the clock moves", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-11-12T22:59:30.000Z"));
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-12", "Lire le chapitre 2"),
        deadline(2, "2026-11-14", "Exposé", { done: true }),
      ],
    );
    await renderAppAt("/");
    await screen.findByRole("tablist", { name: "Vue des échéances" });

    act(() => {
      vi.setSystemTime(new Date("2026-11-12T23:00:30.000Z"));
      vi.advanceTimersByTime(60_000);
    });

    await screen.findByRole("tablist", { name: "Vue des échéances" });
    expect(screen.queryByText(WEEK_DONE)).toBeNull();
  });
});
