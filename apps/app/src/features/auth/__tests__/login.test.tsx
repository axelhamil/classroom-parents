// @vitest-environment jsdom
import { frCatalog } from "@packages/i18n";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderApp, resetApp } from "../../../__tests__/render-app";
import { authClient } from "../../../shared/auth/auth-client";
import { env } from "../../../shared/env";
import { AUTO_START_FALLBACK_MS } from "../use-auto-google-sign-in";

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

describe("a sign in started from the public site", () => {
  beforeEach(() => {
    vi.mocked(authClient.signIn.social).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetApp();
  });

  it("given the site call to action, then Google opens without a second click and the page says it is redirecting", async () => {
    fakeApi({});
    await renderApp("/login?start=google&redirect=%2Fhistory", { signedIn: false });

    expect((await screen.findByRole("status")).textContent).toBe(copy.redirecting);
    expect(screen.queryByRole("button", { name: copy.google })).toBeNull();
    await waitFor(() =>
      expect(authClient.signIn.social).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: `${window.location.origin}/history`,
          errorCallbackURL: `${window.location.origin}/login?redirect=%2Fhistory`,
        }),
      ),
    );
    expect(authClient.signIn.social).toHaveBeenCalledTimes(1);
  });

  it("given Google never takes over, then the button comes back after a few seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fakeApi({});
    await renderApp("/login?start=google", { signedIn: false });
    await screen.findByRole("status");

    vi.advanceTimersByTime(AUTO_START_FALLBACK_MS);

    expect(await screen.findByRole("button", { name: copy.google })).toBeTruthy();
    expect(authClient.signIn.social).toHaveBeenCalledTimes(1);
  });

  it("given the start fails, then the button comes back at once", async () => {
    vi.mocked(authClient.signIn.social).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fakeApi({});
    await renderApp("/login?start=google", { signedIn: false });

    expect(await screen.findByRole("button", { name: copy.google })).toBeTruthy();
  });

  it("given Google sent the parent back with an error, then nothing starts again on its own", async () => {
    fakeApi({});
    await renderApp("/login?start=google&error=access_denied", { signedIn: false });

    expect((await screen.findByRole("alert")).textContent).toBe(copy.cancelled);
    expect(screen.getByRole("button", { name: copy.google })).toBeTruthy();
    expect(authClient.signIn.social).not.toHaveBeenCalled();
  });
});
