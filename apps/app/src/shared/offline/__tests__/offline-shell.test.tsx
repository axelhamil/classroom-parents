// @vitest-environment jsdom
import { onlineManager } from "@tanstack/react-query";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryClient, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import { givenBriefingHome, givenCalendar } from "../../../__tests__/calendar-fixtures";
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
const THURSDAY_SCHOOL_AFTERNOON = new Date("2026-11-19T14:12:00.000Z");

const THURSDAY_MORNING = new Date("2026-11-19T08:00:00.000Z");

const KEPT_OFFLINE = [EVENTS_KEY[0], "children", "session"];

function today(): HTMLElement {
  const block = document.querySelector<HTMLElement>("[data-block=today]");
  if (!block) throw new Error("the home shows no Pour aujourd'hui block");

  return block;
}

function isKeptOffline(queryKey: readonly unknown[]): boolean {
  return KEPT_OFFLINE.includes(String(queryKey[0]));
}

function nextSchoolMoment(): Promise<HTMLElement> {
  return screen.findByRole("region", { name: /^Pour (aujourd'hui|demain)$/ });
}

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
    givenBriefingHome([CHILD], [deadline(1, "2026-11-19", "Piscine")]);
    await renderAppAt("/");
    const briefing = await nextSchoolMoment();
    await within(briefing).findByText("Piscine");
    vi.setSystemTime(new Date(2026, 10, 19, 18, 40));

    act(() => onlineManager.setOnline(false));

    expect(screen.getByText("Hors ligne, données du 19/11 à 15 h 12")).toBeDefined();

    act(() => onlineManager.setOnline(true));

    expect(screen.queryByText(/Hors ligne/)).toBeNull();
  });

  it("given the agenda was loaded, when the server stops answering while the phone thinks it is online, then the agenda stays with a calm banner instead of an error", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(THURSDAY_AFTERNOON);
    givenBriefingHome([CHILD], [deadline(1, "2026-11-19", "Piscine")]);
    await renderAppAt("/");
    const briefing = await nextSchoolMoment();
    await within(briefing).findByText("Piscine");
    stubApi(() => {
      throw new TypeError("Failed to fetch");
    });

    await act(() => queryClient.refetchQueries({ queryKey: EVENTS_KEY }));

    expect(await screen.findByText("Connexion instable, données du 19/11 à 15 h 12")).toBeDefined();
    expect(within(briefing).getByText("Piscine")).toBeDefined();
    expect(screen.queryByText(/Le chargement n'a pas abouti/)).toBeNull();
  });

  it("given the phone opens offline with the agenda kept and no layout arranged, then the advised home shows instead of a skeleton", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(THURSDAY_MORNING);
    givenCalendar([CHILD], [deadline(1, "2026-11-19", "Piscine")]);
    await renderAppAt("/");
    await waitFor(() => expect(within(today()).getByText("Piscine")).toBeDefined());
    cleanup();
    for (const query of queryClient.getQueryCache().findAll())
      if (!isKeptOffline(query.queryKey)) queryClient.removeQueries({ queryKey: query.queryKey });
    stubApi(() => {
      throw new TypeError("Failed to fetch");
    });
    act(() => onlineManager.setOnline(false));

    await renderAppAt("/");

    await waitFor(() => expect(document.querySelector("[data-block=today]")).not.toBeNull());
    expect(within(today()).getByText("Piscine")).toBeDefined();
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

  it("given unread notifications and open deadlines today, then the app icon shows the server unread count only", async () => {
    const setAppBadge = vi.fn(async (_count?: number) => undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      setAppBadge,
      clearAppBadge: vi.fn(async () => undefined),
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(THURSDAY_SCHOOL_AFTERNOON);
    givenBriefingHome(
      [CHILD],
      [
        deadline(1, "2026-11-19", "Piscine"),
        deadline(2, "2026-11-19", "Carnet signé", { done: true }),
        deadline(3, "2026-11-19", "Exposé"),
        deadline(4, "2026-11-20", "Dictée"),
      ],
      { unread: 5 },
    );

    await renderAppAt("/");

    await waitFor(() => expect(setAppBadge).toHaveBeenLastCalledWith(5));
  });
});
