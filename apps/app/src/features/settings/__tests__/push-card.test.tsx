// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { byRoute, json, renderWithProviders, stubApi } from "../../../__tests__/app-harness";
import {
  ANDROID_CHROME,
  fakeSubscription,
  givenNoPushBrowser,
  givenPushBrowser,
  givenUserAgent,
  IPHONE_SAFARI,
} from "../../../__tests__/push-browser";
import { queryClient } from "../../../shared/api/query-client";
import { rememberPushOwner } from "../../../shared/pwa/push-support";
import { captureInstallPrompt } from "../../../shared/pwa/use-install-state";
import { PushCard } from "../components/push-card";

const EMAIL_FALLBACK = /elles vous sont envoyées par e-mail/;
const HERE = "https://fcm.googleapis.com/fcm/send/here";

function renderCard(live: number, defaults: unknown[] = []) {
  stubApi(
    byRoute({
      "GET /push/status": () => json({ live }),
      "GET /reminders/defaults": () => json({ reminders: defaults }),
      "GET /push/lock-screen": () => json({ details: false }),
    }),
  );
  return renderWithProviders(<PushCard userId="user-1" />);
}

describe("PushCard", () => {
  beforeEach(() => {
    givenUserAgent(ANDROID_CHROME, false);
  });

  afterEach(() => {
    queryClient.clear();
    localStorage.clear();
    givenNoPushBrowser();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("given notifications blocked, then it explains how to allow them again and offers no enable button", async () => {
    givenPushBrowser({ permission: "denied" });

    await renderCard(0);

    expect(screen.getByText("Notifications bloquées")).toBeTruthy();
    expect(screen.getByText(/Autorisations, puis Notifications/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Activer les alertes" })).toBeNull();
  });

  it("given no device receives alerts, then it says reminders go by email", async () => {
    givenPushBrowser({ permission: "default" });

    await renderCard(0);

    expect(await screen.findByText(EMAIL_FALLBACK)).toBeTruthy();
  });

  it("given this phone is subscribed for this parent, then it shows alerts on, a way to turn them off and no email notice", async () => {
    givenPushBrowser({ permission: "granted", existing: fakeSubscription(HERE) });
    rememberPushOwner({ userId: "user-1", endpoint: HERE });

    await renderCard(0);

    expect(await screen.findByText("Activées")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ne plus recevoir d'alertes ici" })).toBeTruthy();
    expect(screen.queryByText(EMAIL_FALLBACK)).toBeNull();
  });

  it("given this phone subscribed for another parent, then it offers to enable alerts and says reminders go by email", async () => {
    givenPushBrowser({ permission: "granted", existing: fakeSubscription(HERE) });
    rememberPushOwner({ userId: "other-parent", endpoint: HERE });

    await renderCard(0);

    expect(await screen.findByText(EMAIL_FALLBACK)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Activer les alertes" })).toBeTruthy();
    expect(screen.queryByText("Activées")).toBeNull();
  });

  it("given the parent's defaults, then the card names them instead of a fixed delay", async () => {
    givenPushBrowser({ permission: "default" });

    await renderCard(1, [
      { kind: "days_before", days: 1, time: "19:00" },
      { kind: "hours_before", hours: 3 },
    ]);

    expect(
      await screen.findByText("Rappels par défaut : la veille, à 19 h et 3 heures avant."),
    ).toBeTruthy();
    expect(screen.queryByText(/deux jours avant/)).toBeNull();
  });

  it("given no default reminder, then the card says only chosen reminders alert", async () => {
    givenPushBrowser({ permission: "default" });

    await renderCard(1);

    expect(await screen.findByText(/Aucun rappel par défaut/)).toBeTruthy();
    expect(screen.queryByText(/deux jours avant/)).toBeNull();
  });

  it("given a browser without push support, then it says so instead of offering a button", async () => {
    givenNoPushBrowser();

    await renderCard(0);

    expect(screen.getByText(/ne sait pas recevoir de notifications/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Activer les alertes" })).toBeNull();
  });

  it("given this phone is subscribed, then the parent can choose to show the children's details on the lock screen", async () => {
    givenPushBrowser({ permission: "granted", existing: fakeSubscription(HERE) });
    rememberPushOwner({ userId: "user-1", endpoint: HERE });
    const calls = stubApi(
      byRoute({
        "GET /push/status": () => json({ live: 1 }),
        "GET /reminders/defaults": () => json({ reminders: [] }),
        "GET /push/lock-screen": () => json({ details: false }),
        "PUT /push/lock-screen": ({ body }) => json(body),
      }),
    );
    await renderWithProviders(<PushCard userId="user-1" />);

    const details = await screen.findByRole("switch", {
      name: "Afficher les détails sur l'écran verrouillé",
    });
    expect(details.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(details);

    await waitFor(() =>
      expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ details: true }),
    );
  });

  it.each([
    ["Chrome on Android", ANDROID_CHROME, false, /cadenas à gauche de l'adresse/],
    [
      "the app installed on Android",
      ANDROID_CHROME,
      true,
      /Paramètres du téléphone, puis Applications, puis KeepUpKids/,
    ],
    [
      "the app installed on an iPhone",
      IPHONE_SAFARI,
      true,
      /Réglages, puis Notifications, puis KeepUpKids/,
    ],
    [
      "a computer",
      "Mozilla/5.0 (X11; Linux x86_64) Chrome/142.0.0.0",
      false,
      /icône à gauche de l'adresse/,
    ],
  ])(
    "given notifications blocked in %s, then the recovery steps fit it",
    async (_, agent, standalone, steps) => {
      givenUserAgent(agent, standalone);
      givenPushBrowser({ permission: "denied" });

      await renderCard(0);

      expect(screen.getByText(steps)).toBeTruthy();
    },
  );

  it("given the parent blocks notifications in the browser while the card is open, then the card says so without a reload", async () => {
    givenPushBrowser({ permission: "default" });
    const status = Object.assign(new EventTarget(), { state: "prompt" });
    Object.defineProperty(window.navigator, "permissions", {
      configurable: true,
      value: { query: vi.fn(async () => status) },
    });
    await renderCard(0);
    await screen.findByRole("button", { name: "Activer les alertes" });

    await act(async () => {
      status.state = "denied";
      status.dispatchEvent(new Event("change"));
    });

    expect(await screen.findByText("Notifications bloquées")).toBeTruthy();
    Reflect.deleteProperty(window.navigator, "permissions");
  });

  it("given Chrome on Android offered to install the app, then an install button opens that prompt", async () => {
    givenPushBrowser({ permission: "default" });
    const stop = captureInstallPrompt(window);
    const prompt = vi.fn(async () => undefined);
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt }),
      );
    });

    await renderCard(0);
    fireEvent.click(screen.getByRole("button", { name: "Installer l'application" }));

    expect(prompt).toHaveBeenCalledTimes(1);
    stop();
  });
});
