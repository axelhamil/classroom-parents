import { shiftDate } from "@packages/ddd-kit/days";
import { PARIS_TIME_ZONE, zonedWallTimeToUtc } from "@packages/ddd-kit/zoned-time";
import type { Page, Request } from "@playwright/test";
import { type Block, inCases } from "./served-layout";

export const LEA = {
  id: "8d0c1f4e-6a51-4c55-9c39-3a1f1e0b7a11",
  label: "Léa",
  googleEmail: "lea@example.com",
  status: "connected",
  lastSyncedAt: "2026-11-09T08:00:00.000Z",
  syncing: false,
};

export const MAXIMILIEN = {
  id: "5b7e2c90-1d3f-4e8a-b6c2-9f0a1e2d3c44",
  label: "Maximilien-Alexandre",
  googleEmail: "maximilien.alexandre@example.com",
  status: "blocked_by_school",
  cause: "school_blocked",
  lastSyncedAt: "2026-11-01T08:00:00.000Z",
  syncing: false,
};

/** A third child, connected and read, for the homes that list a block per child. */
export const JADE = {
  id: "c3a9e1d2-7b4f-4a6e-8c1d-2e3f4a5b6c77",
  label: "Jade",
  googleEmail: "jade@example.com",
  status: "connected",
  lastSyncedAt: "2026-11-10T08:00:00.000Z",
  syncing: false,
};

/** A parent whose only child is still being read, with no deadline yet: the advice leads with the first steps. */
export const NEWCOMER = { ...LEA, lastSyncedAt: null, syncing: true };

/**
 * A Thursday of school term: what the home shows depends on the day (evening, weekend, holidays),
 * so the gate pins its pages to one day instead of the day it happens to run on. `A11Y_TODAY` moves
 * it, which is how a change is checked on other days; the weekend has its own project.
 */
export const SCHOOL_THURSDAY = "2026-11-19";

export const TODAY = process.env.A11Y_TODAY ?? SCHOOL_THURSDAY;

export function inDays(days: number): string {
  return shiftDate(TODAY, days);
}

export function parisTime(date: string, time: string): Date {
  const instant = zonedWallTimeToUtc(date, time, PARIS_TIME_ZONE);
  if (instant.isFailure) throw new Error(`${date} ${time} is not a Paris wall time`);

  return instant.getValue();
}

export function todayAt(time: string): Date {
  return parisTime(TODAY, time);
}

const LONG_TITLE =
  "Sortie au musée des Arts et Métiers avec pique-nique tiré du sac, autorisation parentale signée, gourde, casquette, ticket de métro et 5 euros pour la boutique à rapporter au plus tard vendredi matin";

export const REVIEW_EVENT = {
  id: "0f6b6a2c-3c1d-4f0e-9a43-5d2b1c7e8f90",
  childId: LEA.id,
  title: LONG_TITLE,
  description: "Prévoir un pique-nique et l'autorisation signée.",
  category: "school_trip",
  deadlineDate: inDays(1),
  deadlineAt: `${inDays(1)}T07:00:00.000Z`,
  status: "needs_review",
  reviewReasons: ["weekday_mismatch", "relative_holiday"],
  amendReason: "moved",
  evidence: {
    before: "Bonjour à toutes et à tous. ",
    quote: "Sortie au musée des Arts et Métiers jeudi 26 avant les vacances",
    after: ", autorisation signée à rapporter vendredi matin.",
  },
  source: "announcement",
  done: false,
  announcementUrl: "https://classroom.google.com/c/abc/p/def",
  receivedAt: todayAt("08:00").toISOString(),
  edited: false,
  editedFields: [],
  checklist: { done: [], removed: [], extra: [] },
};

const BUSY_TITLES = ["Fiche de fractions", "Lire le chapitre 3", "Contrôle de géographie"];

/** Three deadlines on each of the next six days, alternating children: enough to scroll every view. */
export const BUSY_WEEK = Array.from({ length: 18 }, (_, index) => {
  const day = inDays(1 + Math.floor(index / 3));

  return {
    ...REVIEW_EVENT,
    id: `5e6f7a8b-9c0d-4e1f-8a2b-${String(index).padStart(12, "0")}`,
    childId: index % 2 === 0 ? LEA.id : MAXIMILIEN.id,
    status: "confirmed",
    category: index % 3 === 2 ? "assessment" : "homework",
    title: `${BUSY_TITLES[index % 3]} ${index + 1}`,
    deadlineDate: day,
    deadlineAt: `${day}T07:00:00.000Z`,
  };
});

export const EVENTS = [
  REVIEW_EVENT,
  {
    ...REVIEW_EVENT,
    id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    title: "Exercices 4 à 9 page 112",
    category: "homework",
    source: "coursework",
    status: "confirmed",
    deadlineDate: inDays(3),
    deadlineTime: "08:30",
  },
  {
    ...REVIEW_EVENT,
    id: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
    childId: MAXIMILIEN.id,
    title: "Piscine : maillot, bonnet, lunettes",
    category: "swimming",
    status: "confirmed",
    deadlineDate: inDays(9),
  },
];

interface ApiFixtures {
  children: unknown[];
  events: unknown[];
  detail?: unknown;
  reminders?: number;
  homeLayout?: Block[];
  /** The school calendar of the family's zone; left out, the gate's empty calendar stands (`csp.ts`). */
  schoolCalendar?: SchoolCalendarFixture;
}

export interface SchoolCalendarFixture {
  zone: string | null;
  holidays: { name: string; startsOn: string; endsOn: string }[];
  bankHolidays: { date: string }[];
}

/** The line of late deadlines lives in the Agenda only while the "En retard" block is hidden. */
export const AGENDA_WITHOUT_OVERDUE_BLOCK: Block[] = [{ id: "calendar", size: { w: 4, h: 2 } }];

function statusOf(event: unknown): unknown {
  return typeof event === "object" && event !== null && "status" in event
    ? event.status
    : undefined;
}

function apiPath(request: Request): string | undefined {
  return request.resourceType() === "fetch" ? new URL(request.url()).pathname : undefined;
}

export async function serveFamily(page: Page, fixtures: ApiFixtures): Promise<Request[]> {
  const eventRequests: Request[] = [];

  // The signed-in state carries the home kept by the seeded account; the family served here is another one.
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage))
      if (key.endsWith(":home:layout:v2")) localStorage.removeItem(key);
  });

  await page.route("**/*", async (route) => {
    const request = route.request();
    const path = apiPath(request);
    if (path === "/children") return route.fulfill({ json: fixtures.children });
    if (path === "/sync") return route.fulfill({ status: 202, json: { status: "requested" } });
    if (path === "/home/layout")
      return route.fulfill({ json: { v: 3, blocks: inCases(fixtures.homeLayout), revision: 0 } });
    if (path === "/home/note") return route.fulfill({ json: { body: "", updatedAt: null } });
    if (path === "/notifications/unread-count") return route.fulfill({ json: { count: 0 } });
    if (path === "/school-calendar" && fixtures.schoolCalendar)
      return route.fulfill({ json: fixtures.schoolCalendar });
    if (path === "/events") {
      eventRequests.push(request);
      const status = new URL(request.url()).searchParams.get("status");
      const items = status
        ? fixtures.events.filter((event) => statusOf(event) === status)
        : fixtures.events;
      return route.fulfill({ json: { items } });
    }
    if (path === "/events/calendar") {
      eventRequests.push(request);
      return route.fulfill({ json: { items: fixtures.events } });
    }
    if (path === `/events/${REVIEW_EVENT.id}`)
      return route.fulfill({ json: fixtures.detail ?? REVIEW_EVENT });
    if (path === `/events/${REVIEW_EVENT.id}/confirm`) {
      const status = request.method() === "DELETE" ? "needs_review" : "confirmed";
      return route.fulfill({ json: { ...REVIEW_EVENT, status } });
    }
    if (path === `/events/${REVIEW_EVENT.id}/reminders`)
      return route.fulfill({
        json: {
          customized: true,
          reminders: REMINDERS.slice(0, fixtures.reminders),
        },
      });

    return route.fallback();
  });

  return eventRequests;
}

const REMINDERS = [
  {
    reminder: { kind: "days_before", days: 3, time: "18:00" },
    dueAt: todayAt("07:00").toISOString(),
    status: "sent",
    fits: true,
  },
  {
    reminder: { kind: "days_before", days: 1, time: "07:30" },
    dueAt: todayAt("07:00").toISOString(),
    status: "skipped",
    fits: true,
  },
  {
    reminder: { kind: "days_before", days: 0, time: "07:00" },
    dueAt: todayAt("07:00").toISOString(),
    status: "pending",
    fits: true,
  },
  {
    reminder: { kind: "hours_before", hours: 2 },
    dueAt: null,
    status: "unplanned",
    fits: true,
  },
  {
    reminder: { kind: "hours_before", hours: 1 },
    dueAt: todayAt("07:00").toISOString(),
    status: "missed",
    fits: true,
  },
];
