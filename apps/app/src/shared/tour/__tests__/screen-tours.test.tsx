// @vitest-environment jsdom
import { frCatalog } from "@packages/i18n";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { byRoute, json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import { CHILD } from "../../../__tests__/family-fixtures";

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
      "GET /push/status": () => json({ live: 0 }),
      "GET /api/auth/list-sessions": () => json([]),
    }),
  );
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
    givenFamily();
    const router = await renderAppAt("/settings");

    await userEvent.click(
      await screen.findByRole("button", { name: frCatalog.settings.tour.action }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(await screen.findByRole("dialog", { name: tour.home.week.title })).toBeTruthy();
  });
});
