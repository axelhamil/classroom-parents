// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  byRoute,
  json,
  renderAppAt,
  renderWithProviders,
  resetApp,
  stubApi,
} from "../../../__tests__/app-harness";
import { ensureGetAnimations, ensureMatchMedia } from "../../../__tests__/match-media";
import { ThemeToggle } from "../theme-toggle";

const isDark = () => document.documentElement.classList.contains("dark");

describe("theme choice", () => {
  beforeEach(() => {
    ensureMatchMedia();
    ensureGetAnimations();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    resetApp();
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("given a public page, when the parent picks Sombre in the theme menu, then the page turns dark and the choice is kept", async () => {
    await renderWithProviders(<ThemeToggle />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Thème : Clair" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Sombre" }));

    await waitFor(() => expect(isDark()).toBe(true));
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Thème : Sombre" })).toBeDefined();
  });

  it("given the shell, when the parent picks Automatique in the user menu, then the app follows the light system", async () => {
    stubApi(byRoute({ "GET /push/status": () => json({ live: 1 }) }));
    await renderAppAt("/settings");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /^Ouvrir le menu utilisateur/ }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Automatique" }));

    await waitFor(() => expect(localStorage.getItem("theme")).toBe("system"));
    expect(isDark()).toBe(false);
  });
});
