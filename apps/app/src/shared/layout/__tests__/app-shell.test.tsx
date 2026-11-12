// @vitest-environment jsdom
import { frCatalog } from "@packages/i18n";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderApp, resetApp } from "../../../__tests__/render-app";

vi.mock("../../auth/auth-client", () => ({
  authClient: { getSession: vi.fn(), signOut: vi.fn() },
}));

vi.mock("../../api/user-stream", () => ({
  connectUserStream: () => new Promise(() => undefined),
}));

const nav = frCatalog.common.nav;

describe("app shell", () => {
  afterEach(resetApp);

  it("app shell shows Accueil, Enfants, Réglages with aria-current on the active route", async () => {
    fakeApi({ "GET /children": { body: [] } });

    await renderApp("/children");

    const navigations = await screen.findAllByRole("navigation", { name: nav.label });
    expect(navigations.length).toBeGreaterThan(0);
    for (const navigation of navigations) {
      const links = within(navigation).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual([nav.home, nav.children, nav.settings]);
      expect(within(navigation).getByRole("link", { name: nav.children }).ariaCurrent).toBe("page");
      expect(within(navigation).getByRole("link", { name: nav.home }).ariaCurrent).toBeNull();
    }
  });

  it("user menu offers Se déconnecter", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    fakeApi({ "GET /children": { body: [] } });

    await renderApp("/children");

    await userEvent.click(
      await screen.findByRole("button", { name: frCatalog.common.userMenu.openMenu }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: frCatalog.common.userMenu.signOut }),
    );

    expect(
      await screen.findByRole("alertdialog", { name: frCatalog.settings.signOut.dialogTitle }),
    ).toBeTruthy();
  });
});
