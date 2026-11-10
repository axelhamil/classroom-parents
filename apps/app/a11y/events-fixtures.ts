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

export function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
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
  receivedAt: new Date().toISOString(),
  edited: false,
  editedFields: [],
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
    if (path === `/events/${REVIEW_EVENT.id}`)
      return route.fulfill({ json: fixtures.detail ?? REVIEW_EVENT });
    if (path === `/events/${REVIEW_EVENT.id}/alert`)
      return route.fulfill({
        json: {
          alert: {
            date: inDays(-1),
            time: "18:00",
            dueAt: new Date().toISOString(),
            origin: "default",
          },
        },
      });

    return route.fallback();
  });

  return eventRequests;
}
