// @vitest-environment jsdom
import { screen } from "@testing-library/react";
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
import { ANDROID_CHROME, givenUserAgent } from "../../../__tests__/push-browser";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { queryClient } from "../../../shared/api/query-client";
import { DeletionPendingBanner } from "../../../shared/components/deletion-pending-banner";
import { DeleteAccountCard } from "../components/delete-account-card";

const UNTIL = "2026-11-17T10:00:00.000Z";

function session(pendingDeletionUntil: string | null) {
  return {
    user: { id: "user-1", name: "Parent", email: "parent@example.com", pendingDeletionUntil },
    session: { id: "session-1", token: "token-1" },
  };
}

function givenServer(initiallyPending: string | null) {
  const cachedCookie = session(initiallyPending);
  let pendingUntil = initiallyPending;

  return stubApi(
    byRoute({
      "GET /api/auth/get-session": ({ url }) =>
        json(
          url.searchParams.get("disableCookieCache") === "true"
            ? session(pendingUntil)
            : cachedCookie,
        ),
      "POST /me/delete": () => {
        pendingUntil = UNTIL;
        return json({ pendingDeletionUntil: UNTIL });
      },
      "DELETE /me/delete": () => {
        pendingUntil = null;
        return json(null);
      },
    }),
  );
}

async function renderSettingsDeletion(): Promise<void> {
  await renderWithProviders(
    <>
      <DeletionPendingBanner />
      <DeleteAccountCard />
    </>,
  );
}

async function confirmDeletion() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Supprimer mon compte" }));
  await user.click(await screen.findByRole("button", { name: "Oui, supprimer mon compte" }));
}

describe("DeleteAccountCard", () => {
  afterEach(() => {
    queryClient.clear();
    vi.unstubAllGlobals();
  });

  describe("given no deletion scheduled", () => {
    beforeEach(() => {
      queryClient.setQueryData(sessionQueryOptions.queryKey, session(null));
    });

    it("when the parent confirms, then the page shows the scheduled deletion at once, even while the session cookie still says otherwise", async () => {
      const calls = givenServer(null);
      await renderSettingsDeletion();

      await confirmDeletion();

      expect(await screen.findByText("Suppression programmée")).toBeTruthy();
      expect(screen.getAllByRole("button", { name: "Annuler la suppression" })).toHaveLength(1);
      expect(
        calls.filter((call) => call.method === "POST").map((call) => call.url.pathname),
      ).toEqual(["/me/delete"]);
    });

    it("given a session older than 24 hours, when the parent confirms, then it asks to sign in again with Google and sends them back to the settings", async () => {
      const calls = stubApi(
        byRoute({
          "POST /me/delete": () =>
            json({ error: { code: "ACCOUNT_REAUTH_REQUIRED", message: "reauth" } }, 403),
          "POST /api/auth/sign-in/social": () =>
            json({ url: "https://accounts.google.com/o/oauth2", redirect: false }),
        }),
      );
      await renderSettingsDeletion();

      await confirmDeletion();

      const reconnect = await screen.findByRole("button", { name: "Me reconnecter avec Google" });
      expect(screen.queryByRole("button", { name: "Supprimer mon compte" })).toBeNull();

      await userEvent.setup().click(reconnect);

      await vi.waitFor(() =>
        expect(
          calls.find((call) => call.url.pathname === "/api/auth/sign-in/social")?.body,
        ).toMatchObject({
          provider: "google",
          callbackURL: `${window.location.origin}/settings`,
          errorCallbackURL: `${window.location.origin}/settings?reauth=failed`,
          loginHint: "parent@example.com",
        }),
      );
    });
  });

  describe("given the parent comes back from a Google confirmation that did not go through", () => {
    beforeEach(() => givenUserAgent(ANDROID_CHROME, false));
    afterEach(() => {
      resetApp();
      vi.restoreAllMocks();
    });

    it("when they cancelled on Google, then the settings say the account is kept and offer to confirm again", async () => {
      stubApi(byRoute({ "GET /push/status": () => json({ live: 0 }) }));

      await renderAppAt("/settings?reauth=failed&error=access_denied");

      expect(
        await screen.findByText("Confirmation Google annulée : votre compte n'est pas supprimé."),
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: "Me reconnecter avec Google" })).toBeTruthy();
    });

    it("when Google failed, then the settings say so in French", async () => {
      stubApi(byRoute({ "GET /push/status": () => json({ live: 0 }) }));

      await renderAppAt("/settings?reauth=failed&error=invalid_code");

      expect(
        await screen.findByText(
          "Google n'a pas pu confirmer votre identité. Votre compte n'est pas supprimé, réessayez.",
        ),
      ).toBeTruthy();
    });
  });

  it("given a scheduled deletion, when the parent cancels it, then the page offers to delete again at once, even while the session cookie still says otherwise", async () => {
    queryClient.setQueryData(sessionQueryOptions.queryKey, session(UNTIL));
    givenServer(UNTIL);
    await renderSettingsDeletion();

    await userEvent.setup().click(screen.getByRole("button", { name: "Annuler la suppression" }));

    expect(await screen.findByRole("button", { name: "Supprimer mon compte" })).toBeTruthy();
    expect(screen.queryByText("Suppression programmée")).toBeNull();
  });
});
