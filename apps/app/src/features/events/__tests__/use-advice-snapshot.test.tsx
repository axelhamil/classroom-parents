// @vitest-environment jsdom

import { PARIS_TIME_ZONE } from "@packages/ddd-kit/zoned-time";
import { onlineManager, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  byRoute,
  json,
  queryClient,
  type RouteReplies,
  resetApp,
  stubApi,
} from "../../../__tests__/app-harness";
import { CHILD } from "../../../__tests__/family-fixtures";
import { at, deadline } from "../../../__tests__/week-fixtures";
import { schoolClock } from "../../../shared/agenda/school-clock";
import { useAdviceSnapshot } from "../hooks/use-advice-snapshot";

const THURSDAY_LUNCH = "2026-11-12T12:30:00.000Z";

const MINUTE_MS = 60_000;

const NOEL = { name: "Vacances de Noël", startsOn: "2026-12-19", endsOn: "2027-01-03" };

const ANSWERS: Record<string, () => Response> = {
  "GET /children": () => json([CHILD]),
  "GET /events": () => json({ items: [] }),
  "GET /events/calendar": () => json({ items: [] }),
  "GET /school-calendar": () => json({ holidays: [], bankHolidays: [] }),
};

function held(route: string) {
  const gate = Promise.withResolvers<void>();
  const reply = ANSWERS[route] ?? (() => json({ code: "NOT_FOUND" }, 404));

  return {
    release: () => gate.resolve(),
    answer: async () => {
      await gate.promise;
      return reply();
    },
  };
}

function givenHomeData(overrides: RouteReplies = {}) {
  stubApi(byRoute({ ...ANSWERS, ...overrides }));
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const AFTER_RETRY = { timeout: 4000 };

function renderSnapshot(instant: string, timeZone = PARIS_TIME_ZONE) {
  at(instant);
  const settings = { timeZone, closedDays: new Set<string>() };

  return renderHook(({ now }) => useAdviceSnapshot("user-1", schoolClock(now, settings)), {
    wrapper,
    initialProps: { now: new Date(instant) },
  });
}

let visibility: DocumentVisibilityState = "visible";

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function later(instant: string, minutes: number): Date {
  return new Date(new Date(instant).getTime() + minutes * MINUTE_MS);
}

describe("the home advice reads its context once, when the page opens", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    vi.useRealTimers();
    setVisibility("visible");
    act(() => onlineManager.setOnline(true));
  });

  it.each(Object.keys(ANSWERS))(
    "given %s has not answered yet, then there is no advice",
    async (route) => {
      const slow = held(route);
      givenHomeData({ [route]: slow.answer });
      const { result } = renderSnapshot(THURSDAY_LUNCH);

      await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
      expect(result.current).toBeNull();

      slow.release();
      await waitFor(() => expect(result.current).not.toBeNull());
    },
  );

  it("given the school calendar keeps the home waiting past a second, then the advice goes on without holidays", async () => {
    const slow = held("GET /school-calendar");
    givenHomeData({ "GET /school-calendar": slow.answer });
    const { result } = renderSnapshot("2026-12-22T09:00:00.000Z");

    await waitFor(() => expect(result.current).not.toBeNull(), { timeout: 2000 });
    expect(result.current?.context.holiday).toBe("none");
    slow.release();
  });

  it("given the school calendar fails, then the advice goes on without holidays", async () => {
    givenHomeData({ "GET /school-calendar": () => json({ code: "INTERNAL" }, 500) });
    const { result } = renderSnapshot(THURSDAY_LUNCH);

    await waitFor(() => expect(result.current?.context.holiday).toBe("none"), AFTER_RETRY);
    expect(result.current?.holiday).toBeNull();
  });

  it("given the children fail to load, then the advice welcomes the parent", async () => {
    givenHomeData({ "GET /children": () => json({ code: "INTERNAL" }, 500) });
    const { result } = renderSnapshot(THURSDAY_LUNCH);

    await waitFor(() => expect(result.current?.context.data).toBe("welcome"), AFTER_RETRY);
  });

  it("given the children fail once then answer on the retry, then the advice reads the children", async () => {
    let calls = 0;
    givenHomeData({
      "GET /children": () => {
        calls += 1;
        return calls === 1 ? json({ code: "INTERNAL" }, 500) : json([CHILD]);
      },
    });
    const { result } = renderSnapshot(THURSDAY_LUNCH);

    await waitFor(() => expect(result.current).not.toBeNull(), AFTER_RETRY);
    expect(result.current?.context.childIds).toEqual([CHILD.id]);
    expect(result.current?.context.data).not.toBe("welcome");
  });

  it("given a parent read before whose child is syncing again, then the advice does not welcome them", async () => {
    givenHomeData({ "GET /children": () => json([{ ...CHILD, syncing: true }]) });
    const { result } = renderSnapshot(THURSDAY_LUNCH);

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.context.data).toBe("calm");
  });

  it("given a parent in Montréal on a Tuesday at 9 in the morning, then the advice reads their morning", async () => {
    givenHomeData();
    const { result } = renderSnapshot("2026-11-17T14:00:00.000Z", "America/Montreal");

    await waitFor(() => expect(result.current?.context.moment).toBe("morning"));
  });

  it("given no child linked yet, then the advice welcomes the parent", async () => {
    givenHomeData({ "GET /children": () => json([]) });
    const { result } = renderSnapshot(THURSDAY_LUNCH);

    await waitFor(() => expect(result.current?.context.data).toBe("welcome"));
    expect(result.current?.context.childIds).toEqual([]);
  });

  it("given a holiday today, then the advice names it and says when it ends", async () => {
    givenHomeData({
      "GET /school-calendar": () => json({ holidays: [NOEL], bankHolidays: [] }),
    });
    const { result } = renderSnapshot("2026-12-22T09:00:00.000Z");

    await waitFor(() => expect(result.current?.context.holiday).toBe("during"));
    expect(result.current?.holiday).toEqual({ name: NOEL.name, endsOn: NOEL.endsOn });
  });

  it("given a date to check beyond the home's two weeks, then review is not empty for the advice either", async () => {
    const farReview = deadline(1, "2026-12-15", "Sortie au musée", { status: "needs_review" });
    givenHomeData({
      "GET /events": (call) =>
        json({ items: call.url.searchParams.get("status") === "needs_review" ? [farReview] : [] }),
    });
    const { result } = renderSnapshot(THURSDAY_LUNCH);

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.emptyBlocks.has("review")).toBe(false);
    expect(result.current?.emptyBlocks.has("documents")).toBe(true);
  });

  it("given the phone is offline with nothing cached, then the advice still comes, every source paused", async () => {
    givenHomeData();
    act(() => onlineManager.setOnline(false));
    const { result } = renderSnapshot(THURSDAY_LUNCH);

    await waitFor(() => expect(result.current?.context.data).toBe("welcome"));
  });

  it("given the page stays visible for 3 hours, then the advice does not move", async () => {
    givenHomeData();
    const { result, rerender } = renderSnapshot(THURSDAY_LUNCH);
    await waitFor(() => expect(result.current?.context.moment).toBe("morning"));
    const first = result.current;

    const evening = later(THURSDAY_LUNCH, 180);
    vi.setSystemTime(evening);
    rerender({ now: evening });
    await act(() => queryClient.invalidateQueries());

    expect(result.current).toBe(first);
  });

  it("given the parent comes back after 59 minutes, then the advice does not move", async () => {
    givenHomeData();
    const { result } = renderSnapshot(THURSDAY_LUNCH);
    await waitFor(() => expect(result.current?.context.moment).toBe("morning"));

    setVisibility("hidden");
    vi.setSystemTime(later(THURSDAY_LUNCH, 59));
    setVisibility("visible");

    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(result.current?.context.moment).toBe("morning");
  });

  it("given the parent comes back after 61 minutes, then the advice reads the hour again", async () => {
    givenHomeData();
    const { result } = renderSnapshot(THURSDAY_LUNCH);
    await waitFor(() => expect(result.current?.context.moment).toBe("morning"));

    setVisibility("hidden");
    vi.setSystemTime(later(THURSDAY_LUNCH, 61));
    setVisibility("visible");

    await waitFor(() => expect(result.current?.context.moment).toBe("evening"));
  });
});
