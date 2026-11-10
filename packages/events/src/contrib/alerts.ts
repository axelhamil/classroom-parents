import { z } from "zod";
import { defineEventContribution } from "../contribution";

const AlertRef = z.object({ userId: z.string(), alertId: z.string() });
const Channel = z.enum(["push", "email"]);

export const alertsEvents = defineEventContribution({
  types: {
    ALERT_SCHEDULED: "alert.alert.scheduled",
    ALERT_SENT: "alert.alert.sent",
    ALERT_DELIVERY_FAILED: "alert.delivery.failed",
    ALERT_SKIPPED: "alert.alert.skipped",
    ALERT_MISSED: "alert.alert.missed",
    ALERT_CANCELLED: "alert.alert.cancelled",
    PUSH_UNSUBSCRIBED: "alert.push_subscription.unsubscribed",
    PUSH_SUBSCRIBED: "alert.push_subscription.subscribed",
    PUSH_SUBSCRIPTION_EXPIRED: "alert.push_subscription.expired",
  },
  payloads: {
    "alert.alert.scheduled": AlertRef.extend({
      eventId: z.string(),
      dueAt: z.iso.datetime(),
      origin: z.enum(["default", "user"]),
      actorUserId: z.string().nullable(),
    }),
    "alert.alert.sent": AlertRef.extend({ channel: Channel, actorUserId: z.null() }),
    "alert.delivery.failed": AlertRef.extend({
      channel: Channel,
      code: z.string(),
      actorUserId: z.null(),
    }),
    "alert.alert.skipped": AlertRef.extend({ actorUserId: z.string().nullable() }),
    "alert.alert.missed": AlertRef.extend({ actorUserId: z.null() }),
    "alert.alert.cancelled": AlertRef.extend({
      eventId: z.string(),
      actorUserId: z.string().nullable(),
    }),
    "alert.push_subscription.unsubscribed": z.object({
      userId: z.string(),
      subscriptionId: z.string(),
      actorUserId: z.string(),
    }),
    "alert.push_subscription.subscribed": z.object({
      userId: z.string(),
      subscriptionId: z.string(),
    }),
    "alert.push_subscription.expired": z.object({
      userId: z.string(),
      subscriptionId: z.string(),
      actorUserId: z.null(),
    }),
  },
  retention: {
    "alert.alert.scheduled": "operational",
    "alert.alert.sent": "operational",
    "alert.delivery.failed": "operational",
    "alert.alert.skipped": "operational",
    "alert.alert.missed": "operational",
    "alert.alert.cancelled": "operational",
    "alert.push_subscription.unsubscribed": "operational",
    "alert.push_subscription.subscribed": "operational",
    "alert.push_subscription.expired": "operational",
  },
  visibility: {
    "alert.alert.scheduled": "public",
    "alert.alert.sent": "public",
    "alert.delivery.failed": "internal",
    "alert.alert.skipped": "public",
    "alert.alert.missed": "public",
    "alert.alert.cancelled": "public",
    "alert.push_subscription.unsubscribed": "public",
    "alert.push_subscription.subscribed": "public",
    "alert.push_subscription.expired": "internal",
  },
  descriptions: {
    "alert.alert.scheduled":
      "An alert was scheduled for a school event, by default two days before at 18:00 Paris time or at a time the parent chose.",
    "alert.alert.sent":
      "A scheduled alert reached the parent by web push or, failing that, by email.",
    "alert.delivery.failed":
      "One delivery channel of a scheduled alert failed; the alert is retried until it is sent or missed.",
    "alert.alert.skipped":
      "A pending alert will not be sent: its deadline passed before it, or the event left the agenda.",
    "alert.alert.missed":
      "A due alert could not reach the parent in time, by push or by email, and was given up.",
    "alert.alert.cancelled":
      "A pending alert was cancelled because its event was deleted, withdrawn, done or hidden by a coursework.",
    "alert.push_subscription.unsubscribed": "A parent turned push notifications off on a device.",
    "alert.push_subscription.subscribed": "A parent allowed push notifications on a device.",
    "alert.push_subscription.expired":
      "A device's push subscription was rejected as gone by its push service and removed.",
  },
});
