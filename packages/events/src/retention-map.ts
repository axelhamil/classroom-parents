import { type EventType, EventTypes, isKnownEventType } from "./event-types";
import { CONTRIBUTED_RETENTION } from "./registry";

export type RetentionPolicy = "operational" | "compliance" | "none";

export const RETENTION_MAP: Record<EventType, RetentionPolicy> = {
  [EventTypes.USER_CREATED]: "compliance",
  [EventTypes.USER_SIGNED_IN]: "compliance",
  [EventTypes.USER_EMAIL_VERIFIED]: "compliance",
  [EventTypes.USER_ACCOUNT_LINKED]: "compliance",
  [EventTypes.USER_ACCOUNT_UNLINKED]: "compliance",
  [EventTypes.USER_DELETION_REQUESTED]: "compliance",
  [EventTypes.USER_DELETION_CANCELLED]: "compliance",
  [EventTypes.USER_DELETED]: "compliance",
  [EventTypes.USER_DATA_EXPORT_REQUESTED]: "compliance",
  [EventTypes.USER_PROFILE_UPDATED]: "compliance",
  [EventTypes.USER_SESSION_REVOKED]: "compliance",
  [EventTypes.SECURITY_RATE_LIMIT_EXCEEDED]: "operational",
  [EventTypes.SECURITY_CSRF_REJECTED]: "operational",
  [EventTypes.EMAIL_DELIVERY_EXHAUSTED]: "operational",
  [EventTypes.OUTBOX_EVENT_DEAD]: "operational",
  ...CONTRIBUTED_RETENTION,
};

export function retentionFor(eventType: string): RetentionPolicy {
  if (!isKnownEventType(eventType)) return "none";

  return RETENTION_MAP[eventType];
}
