import type { Page } from "@playwright/test";

const GOOGLE_PHOTO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%23888'/%3E%3C/svg%3E";

const CHILDREN = [
  {
    id: "1a7c2f4e-1d2b-4c3a-9e8f-0a1b2c3d4e5f",
    label: "Marie-Charlotte Delacroix-Beaumont de la",
    color: 1,
    googleEmail: "marie-charlotte.delacroix-beaumont@college-saint-exupery.example",
    status: "connected",
    lastSyncedAt: "2026-11-10T07:30:00.000Z",
    syncing: false,
  },
  {
    id: "2a7c2f4e-1d2b-4c3a-9e8f-0a1b2c3d4e5f",
    label: "Tom",
    color: 2,
    avatarUrl: GOOGLE_PHOTO,
    showsPhoto: false,
    googleEmail: "tom@ecole.example",
    status: "needs_reconnect",
    cause: "invalid_grant",
    syncing: false,
  },
  {
    id: "3a7c2f4e-1d2b-4c3a-9e8f-0a1b2c3d4e5f",
    label: "Inès",
    color: 3,
    googleEmail: "ines@lycee.example",
    status: "blocked_by_school",
    cause: "school_blocked",
    syncing: false,
  },
];

const LINK_CONFIG = {
  providerId: "google-classroom",
  scopes: [
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.announcements.readonly",
    "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
  ],
  clientId: "000000000000-a11yfixture.apps.googleusercontent.com",
};

const REPLIES: Record<string, unknown> = {
  "GET /children": CHILDREN,
  "GET /children/link-config": LINK_CONFIG,
};

export const FIXTURE_CHILD_LABEL = "Tom";

export async function stubChildrenApi(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith("/children"),
    async (route) => {
      const request = route.request();
      const reply = REPLIES[`${request.method()} ${new URL(request.url()).pathname}`];
      if (request.resourceType() !== "fetch") return route.fallback();
      if (reply === undefined) return route.fulfill({ status: 204 });

      return route.fulfill({ json: reply });
    },
  );
}
