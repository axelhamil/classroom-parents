// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byRoute, json, renderWithProviders, stubApi } from "../../../__tests__/app-harness";
import {
  ANDROID_CHROME,
  givenNoPushBrowser,
  givenPushBrowser,
  givenUserAgent,
  IPHONE_SAFARI,
} from "../../../__tests__/push-browser";
import { queryClient } from "../../../shared/api/query-client";
import { PushCard } from "../components/push-card";

const GUIDE_TITLE = "Installer sur l'iPhone";

function renderCard() {
  stubApi(byRoute({ "GET /push/status": () => json({ live: 1 }) }));
  return renderWithProviders(<PushCard userId="user-1" />);
}

describe("iOS install guide", () => {
  afterEach(() => {
    queryClient.clear();
    givenNoPushBrowser();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("given Safari on an iPhone outside the home screen, then the guide shows and alerts cannot be enabled yet", async () => {
    givenUserAgent(IPHONE_SAFARI, false);
    givenNoPushBrowser();

    await renderCard();

    expect(screen.getByRole("heading", { name: GUIDE_TITLE })).toBeTruthy();
    expect(screen.getByText(/Partager/)).toBeTruthy();
    expect(screen.getByText(/Sur l'écran d'accueil/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Activer les alertes" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("given the app opened from the iPhone home screen, then the guide is gone and alerts can be enabled", async () => {
    givenUserAgent(IPHONE_SAFARI, true);
    givenPushBrowser({ permission: "default" });

    await renderCard();

    expect(screen.queryByRole("heading", { name: GUIDE_TITLE })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Activer les alertes" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("given Chrome on Android, then no install guide is shown", async () => {
    givenUserAgent(ANDROID_CHROME, false);
    givenPushBrowser({ permission: "default" });

    await renderCard();

    expect(screen.queryByRole("heading", { name: GUIDE_TITLE })).toBeNull();
  });
});
