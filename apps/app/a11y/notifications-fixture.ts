import type { Page } from "@playwright/test";
import { inDays, parisTime, todayAt } from "./events-fixtures";

const MARIE = "1a7c2f4e-1d2b-4c3a-9e8f-0a1b2c3d4e5f";
const TOM = "2a7c2f4e-1d2b-4c3a-9e8f-0a1b2c3d4e5f";
const HOMEWORK = { id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", title: "Exercices page 42" };
const MUSEUM = { id: "0f6b6a2c-3c1d-4f0e-9a43-5d2b1c7e8f90", title: "Sortie au musée" };

function notification(
  id: number,
  createdAt: Date,
  content: Record<string, unknown>,
  extra: { childId?: string; event?: { id: string; title: string }; read?: boolean } = {},
) {
  return {
    id: `0193a1c0-0000-7000-8000-${String(id).padStart(12, "0")}`,
    content,
    childId: extra.childId ?? null,
    event: extra.event ?? null,
    createdAt: createdAt.toISOString(),
    readAt: extra.read ? createdAt.toISOString() : null,
  };
}

export const NOTIFICATIONS = [
  notification(
    1,
    todayAt("07:30"),
    { kind: "deadline_reminder", eventId: HOMEWORK.id },
    { childId: MARIE, event: HOMEWORK },
  ),
  notification(2, todayAt("07:00"), { kind: "deadline_reminders", count: 3 }),
  notification(
    3,
    todayAt("06:45"),
    { kind: "deadline_amended", eventId: MUSEUM.id, reason: "moved" },
    { childId: TOM, event: MUSEUM },
  ),
  notification(4, parisTime(inDays(-1), "19:10"), { kind: "access_lost" }, { childId: TOM }),
  notification(
    5,
    parisTime(inDays(-1), "18:00"),
    { kind: "new_deadlines", count: 3 },
    { childId: MARIE },
  ),
  notification(
    6,
    parisTime(inDays(-1), "17:20"),
    { kind: "dates_to_check", eventIds: [HOMEWORK.id, MUSEUM.id] },
    { childId: MARIE, read: true },
  ),
  notification(
    7,
    parisTime(inDays(-4), "18:00"),
    { kind: "weekly_digest", deadlines: 5, weekStart: inDays(-3) },
    { read: true },
  ),
  notification(
    8,
    parisTime(inDays(-4), "08:00"),
    { kind: "deadline_amended", eventId: MUSEUM.id, reason: "cancelled" },
    { childId: TOM, read: true },
  ),
];

export const UNREAD_COUNT = NOTIFICATIONS.filter((item) => item.readAt === null).length;

export async function stubNotificationsApi(page: Page, empty = false): Promise<void> {
  const notifications = empty ? [] : NOTIFICATIONS;
  const unread = empty ? 0 : UNREAD_COUNT;

  await page.route(
    (url) => url.pathname.startsWith("/notifications"),
    async (route) => {
      const request = route.request();
      if (request.resourceType() !== "fetch") return route.fallback();

      const { pathname } = new URL(request.url());
      if (pathname === "/notifications")
        return route.fulfill({ json: { notifications, nextCursor: null } });
      if (pathname === "/notifications/unread-count")
        return route.fulfill({ json: { count: unread } });

      return route.fulfill({ status: 204 });
    },
  );
}
