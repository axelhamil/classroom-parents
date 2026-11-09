import type { EventType } from "./event-types";

export type Visibility = "public" | "internal";

export const VISIBILITY = {
  "user.created": "public",
  "user.signed_in": "public",
  "user.email_verified": "public",
  "user.account.linked": "internal",
  "user.account.unlinked": "internal",
  "user.deletion.requested": "public",
  "user.deletion.cancelled": "public",
  "user.deleted": "public",
  "user.profile.updated": "public",
  "security.rate_limit.exceeded": "internal",
  "security.csrf.rejected": "internal",
  "email.delivery.exhausted": "internal",
  "outbox.event_dead": "internal",
} satisfies Record<EventType, Visibility>;

export function isPublicEvent(eventType: EventType): boolean {
  return VISIBILITY[eventType] === "public";
}
