// @vitest-environment jsdom
import { frCatalog } from "@packages/i18n";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderApp, resetApp } from "../../../__tests__/render-app";
import { authClient } from "../../../shared/auth/auth-client";
import { env } from "../../../shared/env";

vi.mock("../../../shared/auth/auth-client", () => ({
  authClient: {
    getSession: vi.fn(),
    signIn: { social: vi.fn(async () => ({ data: { url: "https://accounts.google.com" } })) },
  },
}));

const copy = frCatalog.auth.login;

describe("the home address", () => {
  beforeEach(() => {
    vi.mocked(authClient.signIn.social).mockClear();
  });
  afterEach(resetApp);

  it("given a signed out visitor on the home address, then the sign in page shows and Google brings them back home", async () => {
    fakeApi({});
    await renderApp("/", { signedIn: false });

    await screen.findByRole("heading", { level: 1, name: copy.title });
    await userEvent.click(screen.getByRole("button", { name: copy.google }));

    await waitFor(() =>
      expect(authClient.signIn.social).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
          errorCallbackURL: `${window.location.origin}/login`,
        }),
      ),
    );
  });
});

describe("the sign in page", () => {
  beforeEach(() => {
    vi.mocked(authClient.signIn.social).mockClear();
  });
  afterEach(resetApp);

  it("given a parent sent to sign in from a page, when they continue with Google, then they come back to that page", async () => {
    fakeApi({});
    await renderApp("/login?redirect=%2Fhistory", { signedIn: false });

    await screen.findByRole("heading", { level: 1, name: copy.title });
    await userEvent.click(screen.getByRole("button", { name: copy.google }));

    await waitFor(() =>
      expect(authClient.signIn.social).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
          callbackURL: `${window.location.origin}/history`,
          errorCallbackURL: `${window.location.origin}/login?redirect=%2Fhistory`,
        }),
      ),
    );
  });

  it("given the sign in page, then it holds one button, the read-only line and the way to the public site, and stays out of search results", async () => {
    fakeApi({});
    await renderApp("/login", { signedIn: false });

    await screen.findByRole("heading", { level: 1, name: copy.title });

    expect(screen.getAllByRole("button", { name: copy.google })).toHaveLength(1);
    expect(screen.getByText(copy.readOnly)).toBeTruthy();
    expect(screen.getByRole("link", { name: copy.discover }).getAttribute("href")).toBe(
      env.VITE_SITE_URL,
    );
    expect(screen.queryByRole("figure")).toBeNull();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex");
  });

  it("given the parent cancelled on Google, then the login page says so in French", async () => {
    fakeApi({});
    await renderApp("/login?error=access_denied", { signedIn: false });

    expect((await screen.findByRole("alert")).textContent).toBe(copy.cancelled);
  });

  it("given another Google callback error, then the login page asks to try again", async () => {
    fakeApi({});
    await renderApp("/login?error=state_mismatch", { signedIn: false });

    expect((await screen.findByRole("alert")).textContent).toBe(copy.callbackFailed);
  });
});
