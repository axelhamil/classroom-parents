// @vitest-environment jsdom
import { onlineManager } from "@tanstack/react-query";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryClient, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import { givenCalendar } from "../../../__tests__/calendar-fixtures";
import { CHILD } from "../../../__tests__/family-fixtures";
import { deadline } from "../../../__tests__/week-fixtures";
import { EVENTS_KEY } from "../../api/queries/events";
import { sessionQueryOptions } from "../../api/queries/session";
import { redirectToOnboardingWithoutChild } from "../../children/redirect-to-onboarding";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
}));

const THURSDAY_AFTERNOON = new Date(2026, 10, 19, 15, 12);

describe("shell without network", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    act(() => onlineManager.setOnline(true));
    vi.useRealTimers();
  });

  it("given the agenda was loaded, when the network drops, then a calm banner dates the data shown, and leaves once back online", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(THURSDAY_AFTERNOON);
    givenCalendar([CHILD], [deadline(1, "2026-11-19", "Piscine")]);
    await renderAppAt("/");
    await screen.findByText("Piscine");
    vi.setSystemTime(new Date(2026, 10, 19, 18, 40));

    act(() => onlineManager.setOnline(false));

    expect(screen.getByText("Hors ligne, données du 19/11 à 15 h 12")).toBeDefined();

    act(() => onlineManager.setOnline(true));

    expect(screen.queryByText(/Hors ligne/)).toBeNull();
  });

  it("given the agenda was loaded, when the server stops answering while the phone thinks it is online, then the agenda stays with a calm banner instead of an error", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(THURSDAY_AFTERNOON);
    givenCalendar([CHILD], [deadline(1, "2026-11-19", "Piscine")]);
    await renderAppAt("/");
    await screen.findByText("Piscine");
    stubApi(() => {
      throw new TypeError("Failed to fetch");
    });

    await act(() => queryClient.refetchQueries({ queryKey: EVENTS_KEY }));

    expect(await screen.findByText("Connexion instable, données du 19/11 à 15 h 12")).toBeDefined();
    expect(screen.getByText("Piscine")).toBeDefined();
    expect(screen.queryByText(/Le chargement n'a pas abouti/)).toBeNull();
  });

  it("given the phone starts without network, then the route gates answer at once instead of waiting for the network forever", async () => {
    stubApi(() => {
      throw new TypeError("Failed to fetch");
    });
    act(() => onlineManager.setOnline(false));
    const answered = (work: Promise<unknown>) =>
      Promise.race([
        work.then(
          () => "answered",
          () => "answered",
        ),
        new Promise((resolve) => setTimeout(() => resolve("waiting"), 1500)),
      ]);

    expect(await answered(queryClient.fetchQuery(sessionQueryOptions))).toBe("answered");
    expect(await answered(redirectToOnboardingWithoutChild({ context: { queryClient } }))).toBe(
      "answered",
    );
  });

  it("given the phone starts without network, then the app knows it before any request, so nothing fails and the banner shows", async () => {
    vi.stubGlobal("navigator", { ...navigator, onLine: false });
    vi.resetModules();

    await import("../../api/query-client");

    expect(onlineManager.isOnline()).toBe(false);
  });

  it("given today's open deadlines, then the app icon shows how many are left", async () => {
    const setAppBadge = vi.fn(async (_count?: number) => undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      setAppBadge,
      clearAppBadge: vi.fn(async () => undefined),
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(THURSDAY_AFTERNOON);
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-19", "Piscine"),
        deadline(2, "2026-11-19", "Carnet signé", { done: true }),
        deadline(3, "2026-11-19", "Exposé"),
        deadline(4, "2026-11-20", "Dictée"),
      ],
    );

    await renderAppAt("/");

    await waitFor(() => expect(setAppBadge).toHaveBeenLastCalledWith(2));
  });
});
