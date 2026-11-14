import { shiftDate } from "@packages/ddd-kit/days";
import { PARIS_TIME_ZONE, zonedWallTimeToUtc } from "@packages/ddd-kit/zoned-time";
import type { Page, Request } from "@playwright/test";

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

export const TODAY =
  process.env.A11Y_TODAY ??
  new Intl.DateTimeFormat("en-CA", { timeZone: PARIS_TIME_ZONE }).format(Date.now());

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
  source: "announcement",
  done: false,
  announcementUrl: "https://classroom.google.com/c/abc/p/def",
  receivedAt: todayAt("08:00").toISOString(),
  edited: false,
  editedFields: [],
  checklist: { done: [], removed: [], extra: [] },
};

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
}

function apiPath(request: Request): string | undefined {
  return request.resourceType() === "fetch" ? new URL(request.url()).pathname : undefined;
}

export async function serveFamily(page: Page, fixtures: ApiFixtures): Promise<Request[]> {
  const eventRequests: Request[] = [];

  await page.route("**/*", async (route) => {
    const request = route.request();
    const path = apiPath(request);
    if (path === "/children") return route.fulfill({ json: fixtures.children });
    if (path === "/sync") return route.fulfill({ status: 202, json: { status: "requested" } });
    if (path === "/events") {
      eventRequests.push(request);
      return route.fulfill({ json: { items: fixtures.events } });
    }
    if (path === "/events/calendar") {
      eventRequests.push(request);
      return route.fulfill({ json: { items: fixtures.events } });
    }
    if (path === `/events/${REVIEW_EVENT.id}`)
      return route.fulfill({ json: fixtures.detail ?? REVIEW_EVENT });
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
