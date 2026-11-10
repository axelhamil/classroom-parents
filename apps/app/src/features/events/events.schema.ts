import { z } from "zod";
import { EVENT_CATEGORIES } from "../../shared/events/event-labels";

export const alertTimeSchema = z.object({
  date: z.iso.date(),
  time: z.iso.time({ precision: -1 }),
});

export type AlertTimeInput = z.infer<typeof alertTimeSchema>;

export const EVENT_TITLE_MAX = 120;
export const EVENT_DESCRIPTION_MAX = 2000;

export const eventEditSchema = z.object({
  title: z.string().trim().min(1).max(EVENT_TITLE_MAX),
  description: z.string().trim().max(EVENT_DESCRIPTION_MAX),
  category: z.enum(EVENT_CATEGORIES),
  deadlineDate: z.iso.date(),
  deadlineTime: z.union([z.literal(""), z.iso.time({ precision: -1 })]),
});

export type EventEditInput = z.infer<typeof eventEditSchema>;
