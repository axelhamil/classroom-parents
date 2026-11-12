// @vitest-environment jsdom
import { frCatalog } from "@packages/i18n";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHILD } from "../../../__tests__/family-fixtures";
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

  it.each([
    ["/", nav.home],
    ["/history", nav.home],
    ["/events/event-1", nav.home],
    ["/children", nav.children],
    ["/children/new", nav.children],
    ["/settings", nav.settings],
    ["/settings/privacy", nav.settings],
  ])(
    "app shell shows Accueil, Enfants, Réglages with aria-current on the active route (%s)",
    async (path, active) => {
      fakeApi({ "GET /children": { body: [CHILD] }, "GET /events": { body: [] } });

      await renderApp(path);

      const navigation = await screen.findByRole("navigation", { name: nav.label });
      const links = within(navigation).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual([nav.home, nav.children, nav.settings]);
      expect(
        links.filter((link) => link.ariaCurrent === "page").map((link) => link.textContent),
      ).toEqual([active]);
    },
  );

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
