// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import { BRIEFING_ABOVE_AGENDA, givenCalendar } from "../../../__tests__/calendar-fixtures";
import { CHILD } from "../../../__tests__/family-fixtures";
import { at, deadline } from "../../../__tests__/week-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
}));

const THURSDAY_EVENING_IN_MONTREAL = "2026-11-12T23:30:00.000Z";

const BRIEFING = [
  deadline(1, "2026-11-12", "Exercice en ligne"),
  deadline(2, "2026-11-13", "Sac de piscine", { category: "swimming" }),
];

const FRIDAY_DEADLINE = deadline(3, "2026-11-13", "Sortie au musée", {
  deadlineTime: "09:00",
  deadlineAt: "2026-11-13T14:00:00.000Z",
});

const FRIDAY_MORNING_REMINDER = {
  customized: false,
  reminders: [
    {
      reminder: { kind: "hours_before", hours: 2 },
      dueAt: "2026-11-13T12:00:00.000Z",
      status: "pending",
      fits: true,
    },
  ],
};

const CALENDAR_GIVEN_UP = { timeout: 3000 };

const WEEK_WITHOUT_BRIEFING = [
  { id: "today", w: 4, h: 2, hidden: true },
  { id: "calendar", w: 8, h: 3, hidden: false },
];

interface ParentHome {
  events?: ReturnType<typeof deadline>[];
  homeLayout?: unknown[];
  answers?: Record<string, unknown>;
}

function givenParentIn(
  timeZone: unknown,
  { events = BRIEFING, homeLayout, answers = {} }: ParentHome = {},
): void {
  givenCalendar([CHILD], events, { homeLayout });
  const byPath: Record<string, unknown> = {
    "/assistant/preferences": { locale: "fr", timeZone, country: "CA", extractionEnabled: true },
    ...answers,
  };
  const calendar = globalThis.fetch;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (!(url.pathname in byPath)) return calendar(input, init);

    return Promise.resolve(json(byPath[url.pathname]));
  });
}

function briefedTitles(name: string): string[] {
  const region = screen.getByRole("region", { name });

  return within(region)
    .queryAllByRole("link")
    .map((link) => link.textContent ?? "");
}

describe("the school clock of the shell", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    vi.useRealTimers();
  });

  it("given the school calendar answers in a shape the app does not know, then the home still opens, with weekends as the only days off", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T09:00:00.000Z"));
    stubApi(({ url }) => {
      if (url.pathname === "/children") return json([CHILD]);
      if (url.pathname === "/school-calendar") return json({ items: [] });
      return json({ items: [] });
    });

    await renderAppAt("/");

    expect(
      await screen.findByRole("region", { name: "Pour aujourd'hui" }, CALENDAR_GIVEN_UP),
    ).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("Une erreur est survenue")).toBeNull();
  });

  it("given a parent in Montreal when Paris is already Friday, then the briefing prepares Friday from Montreal's Thursday evening", async () => {
    at(THURSDAY_EVENING_IN_MONTREAL);
    givenParentIn("America/Montreal", { homeLayout: BRIEFING_ABOVE_AGENDA });

    await renderAppAt("/");

    await waitFor(() =>
      expect(briefedTitles("Pour demain")).toEqual(["Exercice en ligne", "Sac de piscine"]),
    );
  });

  it.each([
    ["an unknown zone", "Mars/Olympus"],
    ["no zone chosen", null],
  ])("given %s, then the briefing runs on Paris time", async (_, timeZone) => {
    at(THURSDAY_EVENING_IN_MONTREAL);
    givenParentIn(timeZone);

    await renderAppAt("/");

    await waitFor(() => expect(briefedTitles("Pour aujourd'hui")).toEqual(["Sac de piscine"]));
  });

  it("given a parent in Montreal when Paris is already Friday, then the deadline drawer names Friday tomorrow in its hero and its reminder, at Montreal's hour", async () => {
    at(THURSDAY_EVENING_IN_MONTREAL);
    givenParentIn("America/Montreal", {
      events: [FRIDAY_DEADLINE],
      answers: {
        [`/events/${FRIDAY_DEADLINE.id}`]: FRIDAY_DEADLINE,
        [`/events/${FRIDAY_DEADLINE.id}/reminders`]: FRIDAY_MORNING_REMINDER,
      },
    });

    await renderAppAt(`/events/${FRIDAY_DEADLINE.id}`);

    await waitFor(() =>
      expect(document.querySelector("[data-slot=deadline-hero-day]")?.textContent).toBe("Demain"),
    );
    expect(await screen.findByText("Envoi : Demain, 7 h")).toBeDefined();
  });

  it("given a parent in Montreal when Paris is already Friday, then the calendar's today is Montreal's Thursday", async () => {
    at(THURSDAY_EVENING_IN_MONTREAL);
    givenParentIn("America/Montreal", { homeLayout: WEEK_WITHOUT_BRIEFING });

    await renderAppAt("/");

    expect(
      await screen.findByRole("heading", { level: 2, name: "Du 12 au 18 novembre" }),
    ).toBeDefined();
    await waitFor(() =>
      expect(
        document
          .querySelector("[data-slot=calendar-day][data-tone=today]")
          ?.getAttribute("data-jump"),
      ).toBe("2026-11-12"),
    );
  });
});
