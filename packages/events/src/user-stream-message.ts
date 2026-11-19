import { z } from "zod";

export const UserStreamMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("events.changed") }),
  z.object({ type: z.literal("children.changed") }),
  z.object({ type: z.literal("sync.finished"), childId: z.string() }),
  z.object({ type: z.literal("notification.created"), notificationId: z.string() }),
  z.object({ type: z.literal("notifications.read") }),
]);
export type UserStreamMessage = z.infer<typeof UserStreamMessage>;
