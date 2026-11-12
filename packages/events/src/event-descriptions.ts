import { type EventType, EventTypes, isKnownEventType } from "./event-types";
import { CONTRIBUTED_DESCRIPTIONS } from "./registry";

export const EVENT_DESCRIPTIONS: Record<EventType, string> = {
  [EventTypes.USER_CREATED]: "A new user account was created.",
  [EventTypes.USER_SIGNED_IN]: "A user signed in to their account.",
  [EventTypes.USER_EMAIL_VERIFIED]: "A user verified their email address.",
  [EventTypes.USER_ACCOUNT_LINKED]: "A parent linked a child's Google Classroom account.",
  [EventTypes.USER_ACCOUNT_UNLINKED]: "A user unlinked a third-party sign-in provider.",
  [EventTypes.USER_DELETION_REQUESTED]: "A user scheduled their account for deletion.",
  [EventTypes.USER_DELETION_CANCELLED]: "A user cancelled a pending account deletion.",
  [EventTypes.USER_DELETED]: "A user account was permanently deleted.",
  [EventTypes.USER_PROFILE_UPDATED]: "A user updated their profile details.",
  [EventTypes.USER_SESSION_REVOKED]: "A user signed one of their other devices out.",
  [EventTypes.SECURITY_RATE_LIMIT_EXCEEDED]: "A rate limit was exceeded.",
  [EventTypes.SECURITY_CSRF_REJECTED]: "A request was rejected by CSRF origin checks.",
  [EventTypes.EMAIL_DELIVERY_EXHAUSTED]:
    "An email exhausted its delivery attempts or was rejected; a dead email is replayed every few hours while still recent, and one queued to be erased once settled is deleted at its final death, past that window.",
  [EventTypes.OUTBOX_EVENT_DEAD]:
    "A domain event exhausted its delivery attempts and is now retried every few hours.",
  ...CONTRIBUTED_DESCRIPTIONS,
};

export function descriptionFor(eventType: string): string {
  if (!isKnownEventType(eventType)) return "";

  return EVENT_DESCRIPTIONS[eventType];
}
