// @vitest-environment jsdom
import { frCatalog } from "@packages/i18n";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderApp, resetApp } from "../../../__tests__/render-app";
import { authClient } from "../../../shared/auth/auth-client";

vi.mock("../../../shared/auth/auth-client", () => ({
  authClient: {
    getSession: vi.fn(),
    signIn: { social: vi.fn(async () => ({ data: { url: "https://accounts.google.com" } })) },
  },
}));

const copy = frCatalog.auth.login;
const landing = frCatalog.auth.landing;

describe("signing in with Google", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });
  afterEach(resetApp);

  it("given the parent starts the Google sign in, then a refusal comes back to the app login page", async () => {
    fakeApi({});
    await renderApp("/login", { signedIn: false });

    await userEvent.click(await screen.findByRole("button", { name: copy.google }));

    await waitFor(() =>
      expect(authClient.signIn.social).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
          errorCallbackURL: `${window.location.origin}/login`,
        }),
      ),
    );
  });

  it("login explains the 3 steps and what is never done", async () => {
    fakeApi({});
    await renderApp("/login", { signedIn: false });

    const steps = landing.steps;
    const howItWorks = await screen.findByRole("heading", { level: 2, name: steps.title });
    const list = within(howItWorks.closest("section") ?? document.body).getByRole("list");
    const items = within(list).getAllByRole("listitem");

    expect(items.map((item) => within(item).getByRole("heading").textContent)).toEqual([
      steps.signIn.title,
      steps.addChild.title,
      steps.alerts.title,
    ]);
    expect(screen.getAllByText(/n'écrit jamais dans Classroom/).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 2, name: landing.never.title })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("given the parent reached the end of the landing, then its last button also starts the Google flow", async () => {
    fakeApi({});
    await renderApp("/login", { signedIn: false });

    await userEvent.click(await screen.findByRole("button", { name: landing.closing.action }));

    await waitFor(() =>
      expect(authClient.signIn.social).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "google" }),
      ),
    );
  });

  it("given the parent cancelled on Google, then the login page says so in French", async () => {
    fakeApi({});
    await renderApp("/login?error=access_denied", { signedIn: false });

    expect(await screen.findByText(copy.cancelled)).toBeTruthy();
  });

  it("given another Google callback error, then the login page asks to try again", async () => {
    fakeApi({});
    await renderApp("/login?error=state_mismatch", { signedIn: false });

    expect(await screen.findByText(copy.callbackFailed)).toBeTruthy();
  });
});
