// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { byRoute, json, renderWithProviders, stubApi } from "../../../__tests__/app-harness";
import {
  ANDROID_CHROME,
  fakeSubscription,
  givenNoPushBrowser,
  givenPushBrowser,
  givenUserAgent,
} from "../../../__tests__/push-browser";
import { queryClient } from "../../../shared/api/query-client";
import { rememberPushOwner } from "../../../shared/pwa/push-support";
import { PushCard } from "../components/push-card";

const EMAIL_FALLBACK = /elles vous sont envoyées par e-mail/;
const HERE = "https://fcm.googleapis.com/fcm/send/here";

function renderCard(live: number, defaults: unknown[] = []) {
  stubApi(
    byRoute({
      "GET /push/status": () => json({ live }),
      "GET /reminders/defaults": () => json({ reminders: defaults }),
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
});
