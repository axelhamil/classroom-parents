import { z } from "zod";
import { EventTypes } from "./event-types";
import { CONTRIBUTED_PAYLOADS } from "./registry";

const UserRef = z.object({ userId: z.string() });
const Email = z.email();

export const UserCreatedPayload = UserRef.extend({
  email: Email,
  name: z.string(),
});

export const UserSignedInPayload = UserRef.extend({
  sessionId: z.string(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});

export const UserEmailVerifiedPayload = UserRef.extend({
  email: Email,
});

export const UserAccountLinkedPayload = UserRef.extend({
  providerId: z.string(),
  accountId: z.string(),
});

export const UserAccountUnlinkedPayload = UserRef.extend({
  providerId: z.string(),
  accountId: z.string(),
});

export const UserDeletionRequestedPayload = UserRef.extend({
  pendingDeletionUntil: z.coerce.date(),
});

export const UserDeletionCancelledPayload = UserRef;

export const UserDeletedPayload = UserRef.extend({
  deletedAt: z.coerce.date(),
});

export const UserDataExportRequestedPayload = UserRef.extend({
  requestedAt: z.coerce.date(),
});

export const UserProfileUpdatedPayload = UserRef.extend({
  changes: z.record(z.string(), z.unknown()),
});

export const UserSessionRevokedPayload = UserRef.extend({
  sessionId: z.string(),
});

export const EmailDeliveryExhaustedPayload = z.object({
  messageId: z.string(),
  template: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string(),
  actorUserId: z.string().nullable(),
});

export const OUTBOX_LAST_ERROR_MAX_LENGTH = 1_000;

export const OutboxEventDeadPayload = z.object({
  eventId: z.string(),
  eventType: z.string(),
  aggregateId: z.string(),
  attempts: z.number().int().positive(),
  lastError: z.string().max(OUTBOX_LAST_ERROR_MAX_LENGTH),
  failedHandlers: z.array(z.string()),
  actorUserId: z.null(),
});
export type OutboxEventDeadPayload = z.infer<typeof OutboxEventDeadPayload>;

export const SecurityRateLimitExceededPayload = z.object({
  actorUserId: z.string().nullable(),
  ip: z.string().max(45),
  policyName: z.string().max(64),
  path: z.string().max(512),
  method: z.string().max(16),
});

export const SecurityCsrfRejectedPayload = z.object({
  actorUserId: z.string().nullable(),
  ip: z.string().max(45),
  method: z.string().max(16),
  path: z.string().max(512),
  origin: z.string().max(2048).nullable(),
  reason: z.enum(["missing_origin", "origin_mismatch"]),
});

export const PayloadByEventType = {
  [EventTypes.USER_CREATED]: UserCreatedPayload,
  [EventTypes.USER_SIGNED_IN]: UserSignedInPayload,
  [EventTypes.USER_EMAIL_VERIFIED]: UserEmailVerifiedPayload,
  [EventTypes.USER_ACCOUNT_LINKED]: UserAccountLinkedPayload,
  [EventTypes.USER_ACCOUNT_UNLINKED]: UserAccountUnlinkedPayload,
  [EventTypes.USER_DELETION_REQUESTED]: UserDeletionRequestedPayload,
  [EventTypes.USER_DELETION_CANCELLED]: UserDeletionCancelledPayload,
  [EventTypes.USER_DELETED]: UserDeletedPayload,
  [EventTypes.USER_DATA_EXPORT_REQUESTED]: UserDataExportRequestedPayload,
  [EventTypes.USER_PROFILE_UPDATED]: UserProfileUpdatedPayload,
  [EventTypes.USER_SESSION_REVOKED]: UserSessionRevokedPayload,
  [EventTypes.EMAIL_DELIVERY_EXHAUSTED]: EmailDeliveryExhaustedPayload,
  [EventTypes.OUTBOX_EVENT_DEAD]: OutboxEventDeadPayload,
  [EventTypes.SECURITY_RATE_LIMIT_EXCEEDED]: SecurityRateLimitExceededPayload,
  [EventTypes.SECURITY_CSRF_REJECTED]: SecurityCsrfRejectedPayload,
  ...CONTRIBUTED_PAYLOADS,
} as const;
