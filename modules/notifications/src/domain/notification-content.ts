import { z } from "zod";

export const NOTIFICATION_KINDS = [
  "deadline_reminder",
  "deadline_reminders",
  "weekly_digest",
  "access_lost",
  "new_deadlines",
  "deadline_amended",
  "dates_to_check",
  "school_allowed",
] as const;

const count = z.number().int().positive();

export const notificationContentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("deadline_reminder"), eventId: z.string() }),
  z.object({ kind: z.literal("deadline_reminders"), count }),
  z.object({ kind: z.literal("weekly_digest"), deadlines: count, weekStart: z.iso.date() }),
  z.object({ kind: z.literal("access_lost") }),
  z.object({ kind: z.literal("new_deadlines"), count }),
  z.object({
    kind: z.literal("deadline_amended"),
    eventId: z.string(),
    reason: z.enum(["moved", "cancelled"]),
  }),
  z.object({ kind: z.literal("dates_to_check"), eventIds: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("school_allowed") }),
]);

export type NotificationContent = z.infer<typeof notificationContentSchema>;

export function eventIdsOf(content: NotificationContent): string[] {
  if (content.kind === "dates_to_check") return content.eventIds;
  if (content.kind === "deadline_reminder" || content.kind === "deadline_amended")
    return [content.eventId];

  return [];
}
