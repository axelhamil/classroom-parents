import { z } from "zod";
import { defineEventContribution } from "../contribution";

export const notificationsEvents = defineEventContribution({
  types: {
    NOTIFICATION_CREATED: "notification.notification.created",
    NOTIFICATION_READ: "notification.notification.read",
    NOTIFICATIONS_READ_ALL: "notification.notifications.read_all",
  },
  payloads: {
    "notification.notification.created": z.object({
      userId: z.string(),
      notificationId: z.string(),
      kind: z.string(),
      grouped: z.boolean(),
      actorUserId: z.null(),
    }),
    "notification.notification.read": z.object({
      userId: z.string(),
      notificationId: z.string(),
    }),
    "notification.notifications.read_all": z.object({
      userId: z.string(),
      count: z.number().int().positive(),
    }),
  },
  retention: {
    "notification.notification.created": "operational",
    "notification.notification.read": "operational",
    "notification.notifications.read_all": "operational",
  },
  visibility: {
    "notification.notification.created": "public",
    "notification.notification.read": "public",
    "notification.notifications.read_all": "public",
  },
  descriptions: {
    "notification.notification.created":
      "A notification reached the parent's in-app notification center, new or grouped into an unread one about the same subject.",
    "notification.notification.read":
      "A parent read one notification of their notification center.",
    "notification.notifications.read_all":
      "A parent marked every unread notification of their notification center as read.",
  },
});
