import { CONTRIBUTED_TYPES } from "./registry";

export const EventTypes = {
  USER_CREATED: "user.created",
  USER_SIGNED_IN: "user.signed_in",
  USER_EMAIL_VERIFIED: "user.email_verified",
  USER_ACCOUNT_LINKED: "user.account.linked",
  USER_ACCOUNT_UNLINKED: "user.account.unlinked",
  USER_DELETION_REQUESTED: "user.deletion.requested",
  USER_DELETION_CANCELLED: "user.deletion.cancelled",
  USER_DELETED: "user.deleted",
  USER_DATA_EXPORT_REQUESTED: "user.data_export.requested",
  USER_PROFILE_UPDATED: "user.profile.updated",
  USER_SESSION_REVOKED: "user.session.revoked",
  EMAIL_DELIVERY_EXHAUSTED: "email.delivery.exhausted",
  OUTBOX_EVENT_DEAD: "outbox.event_dead",
  SECURITY_RATE_LIMIT_EXCEEDED: "security.rate_limit.exceeded",
  SECURITY_CSRF_REJECTED: "security.csrf.rejected",
  ...CONTRIBUTED_TYPES,
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

export const ALL_EVENT_TYPES: readonly EventType[] = Object.values(EventTypes);

export function isKnownEventType(value: string): value is EventType {
  return ALL_EVENT_TYPES.some((type) => type === value);
}
