import {
  EVENT_CATEGORIES,
  EVENT_DESCRIPTION_MAX,
  EVENT_TITLE_MAX,
} from "@packages/events/agenda-contract";
import { z } from "zod";

export const eventEditSchema = z.object({
  title: z.string().trim().min(1).max(EVENT_TITLE_MAX),
  description: z.string().trim().max(EVENT_DESCRIPTION_MAX),
  category: z.enum(EVENT_CATEGORIES),
  deadlineDate: z.iso.date(),
  deadlineTime: z.union([z.literal(""), z.iso.time({ precision: -1 })]),
});

export type EventEditInput = z.infer<typeof eventEditSchema>;
