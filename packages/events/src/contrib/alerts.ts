import { z } from "zod";
import { defineEventContribution } from "../contribution";

const AlertRef = z.object({ userId: z.string(), alertId: z.string() });
const Channel = z.enum(["push", "email"]);
const DigestRef = z.object({ userId: z.string(), digestId: z.string(), weekStart: z.iso.date() });

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
    ALERT_DEFAULTS_CHANGED: "alert.reminder_defaults.changed",
    ALERT_REMINDERS_CUSTOMIZED: "alert.event_reminders.customized",
    ALERT_REMINDERS_RESET: "alert.event_reminders.reset",
    WEEKLY_DIGEST_SENT: "alert.weekly_digest.sent",
    WEEKLY_DIGEST_SKIPPED: "alert.weekly_digest.skipped",
    WEEKLY_DIGEST_MISSED: "alert.weekly_digest.missed",
    WEEKLY_DIGEST_PREFERENCE_CHANGED: "alert.weekly_digest_preference.changed",
    ALERT_QUIET_HOURS_CHANGED: "alert.quiet_hours.changed",
    ALERT_LOCK_SCREEN_CHANGED: "alert.lock_screen.changed",
  },
  payloads: {
    "alert.alert.scheduled": AlertRef.extend({
      eventId: z.string(),
      reminder: z.string(),
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
    "alert.reminder_defaults.changed": z.object({ userId: z.string(), reminders: z.number() }),
    "alert.event_reminders.customized": z.object({
      userId: z.string(),
      eventId: z.string(),
      reminders: z.number(),
    }),
    "alert.event_reminders.reset": z.object({ userId: z.string(), eventId: z.string() }),
    "alert.weekly_digest.sent": DigestRef.extend({
      channel: Channel,
      deadlines: z.number(),
      actorUserId: z.null(),
    }),
    "alert.weekly_digest.skipped": DigestRef.extend({
      reason: z.enum(["opted_out", "no_deadline"]),
      actorUserId: z.null(),
    }),
    "alert.weekly_digest.missed": DigestRef.extend({ actorUserId: z.null() }),
    "alert.weekly_digest_preference.changed": z.object({
      userId: z.string(),
      enabled: z.boolean(),
    }),
    "alert.quiet_hours.changed": z.object({
      userId: z.string(),
      enabled: z.boolean(),
      start: z.string(),
      end: z.string(),
    }),
    "alert.lock_screen.changed": z.object({ userId: z.string(), details: z.boolean() }),
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
    "alert.reminder_defaults.changed": "operational",
    "alert.event_reminders.customized": "operational",
    "alert.event_reminders.reset": "operational",
    "alert.weekly_digest.sent": "operational",
    "alert.weekly_digest.skipped": "operational",
    "alert.weekly_digest.missed": "operational",
    "alert.weekly_digest_preference.changed": "operational",
    "alert.quiet_hours.changed": "operational",
    "alert.lock_screen.changed": "operational",
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
    "alert.reminder_defaults.changed": "public",
    "alert.event_reminders.customized": "public",
    "alert.event_reminders.reset": "public",
    "alert.weekly_digest.sent": "public",
    "alert.weekly_digest.skipped": "internal",
    "alert.weekly_digest.missed": "public",
    "alert.weekly_digest_preference.changed": "public",
    "alert.quiet_hours.changed": "public",
    "alert.lock_screen.changed": "public",
  },
  descriptions: {
    "alert.alert.scheduled":
      "One reminder of a school event was scheduled, from the parent's default reminders or from the reminders the parent set for this event.",
    "alert.alert.sent":
      "A scheduled alert reached the parent by web push or, failing that, by email.",
    "alert.delivery.failed":
      "One delivery channel of a scheduled alert failed; the alert is retried until it is sent or missed.",
    "alert.alert.skipped":
      "A pending alert will not be sent: its deadline passed before it, or the event left the agenda.",
    "alert.alert.missed":
      "A due alert could not reach the parent in time, by push or by email, and was given up.",
    "alert.alert.cancelled":
      "A pending alert was cancelled because its event was deleted, withdrawn, done or hidden by a coursework, or its reminder was removed.",
    "alert.push_subscription.unsubscribed": "A parent turned push notifications off on a device.",
    "alert.push_subscription.subscribed": "A parent allowed push notifications on a device.",
    "alert.push_subscription.expired":
      "A device's push subscription was rejected as gone by its push service and removed.",
    "alert.reminder_defaults.changed":
      "A parent changed their default reminders; upcoming events without reminders of their own were replanned.",
    "alert.event_reminders.customized":
      "A parent set the reminders of one event, which no longer follow the default reminders.",
    "alert.event_reminders.reset": "A parent put one event back on the default reminders.",
    "alert.weekly_digest.sent":
      "The Sunday summary of the coming week's deadlines reached the parent by web push or, failing that, by email.",
    "alert.weekly_digest.skipped":
      "A planned Sunday summary was not sent: the parent turned it off or no deadline was left in the coming week.",
    "alert.weekly_digest.missed":
      "A planned Sunday summary could not reach the parent before the week began, by push or by email, and was given up.",
    "alert.weekly_digest_preference.changed":
      "A parent turned the Sunday summary of the coming week on or off.",
    "alert.quiet_hours.changed":
      "A parent changed the hours during which no alert rings; upcoming alerts were replanned around them.",
    "alert.lock_screen.changed":
      "A parent chose whether push notifications show their children's names and deadline titles on the lock screen.",
  },
});
