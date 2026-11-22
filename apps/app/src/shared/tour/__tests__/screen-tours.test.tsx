// @vitest-environment jsdom
import { frCatalog } from "@packages/i18n";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { byRoute, json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import { CHILD } from "../../../__tests__/family-fixtures";
import { at } from "../../../__tests__/week-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "light",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
}));

const tour = frCatalog.tour;

function givenFamily() {
  return stubApi(
    byRoute({
      "GET /children": () => json([CHILD]),
      "GET /events": () => json({ items: [] }),
      "GET /events/calendar": () => json({ items: [] }),
      "GET /push/status": () => json({ live: 0 }),
      "GET /api/auth/list-sessions": () => json([]),
    }),
  );
}

async function stepTitlesUntilFinish(): Promise<string[]> {
  const titles: string[] = [];
  let dialog = await screen.findByRole("dialog");

  for (;;) {
    titles.push(dialog.getAttribute("aria-label") ?? labelOf(dialog));
    const finish = screen.queryByRole("button", { name: tour.controls.finish });
    if (finish) {
      await userEvent.click(finish);
      return titles;
    }

    await userEvent.click(screen.getByRole("button", { name: tour.controls.next }));
    await waitFor(() => expect(labelOf(screen.getByRole("dialog"))).not.toBe(titles.at(-1)));
    dialog = screen.getByRole("dialog");
  }
}

function labelOf(dialog: HTMLElement): string {
  const id = dialog.getAttribute("aria-labelledby");
  return (id && document.getElementById(id)?.textContent) || "";
}

describe("guided tour per screen", () => {
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    resetApp();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("tour shows once per user and screen", async () => {
    givenFamily();
    await renderAppAt("/children", { firstRun: true });

    await screen.findByRole("dialog", { name: tour.children.card.title });
    await userEvent.click(screen.getByRole("button", { name: tour.controls.skip }));
    expect(screen.queryByRole("dialog", { name: tour.children.card.title })).toBeNull();

    cleanup();
    await renderAppAt("/children", { firstRun: true });
    await screen.findByRole("heading", { level: 1 });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(screen.queryByRole("dialog", { name: tour.children.card.title })).toBeNull();

    expect(localStorage.getItem("tour:user-1:children")).toBe("true");
    expect(localStorage.getItem("tour:user-2:children")).toBeNull();
    expect(localStorage.getItem("tour:user-1:home")).toBeNull();
  });

  it("restart from settings shows it again", async () => {
    at("2026-11-12T08:00:00.000Z");
    givenFamily();
    const router = await renderAppAt("/settings/help");

    await userEvent.click(
      await screen.findByRole("button", { name: frCatalog.settings.tour.action }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(await screen.findByRole("dialog", { name: tour.home.today.title })).toBeTruthy();
  });

  it("given an evening home without the day's block, then the home tour runs without its step", async () => {
    at("2026-11-12T19:00:00.000Z");
    givenFamily();
    const errors = vi.spyOn(console, "error");
    await renderAppAt("/", { firstRun: true });

    const titles = await stepTitlesUntilFinish();

    expect(titles[0]).toBe(tour.home.week.title);
    expect(titles).not.toContain(tour.home.today.title);
    expect(titles).toContain(tour.home.nav.title);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(errors).not.toHaveBeenCalled();
  });
});
