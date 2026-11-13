import {
  CHECKLIST_ITEM_MAX,
  EVENT_CATEGORIES,
  EVENT_DESCRIPTION_MAX,
  EVENT_TITLE_MAX,
} from "@packages/events/agenda-contract";
import { z } from "zod";
import { eventFiltersSearchSchema } from "../../shared/events/event-filters.schema";
import { CALENDAR_VIEWS } from "./calendar";
import { PRINT_WEEKS } from "./week";

export const eventEditSchema = z.object({
  title: z.string().trim().min(1).max(EVENT_TITLE_MAX),
  description: z.string().trim().max(EVENT_DESCRIPTION_MAX),
  category: z.enum(EVENT_CATEGORIES),
  deadlineDate: z.iso.date(),
  deadlineTime: z.union([z.literal(""), z.iso.time({ precision: -1 })]),
});

export type EventEditInput = z.infer<typeof eventEditSchema>;

export const homeSearchSchema = eventFiltersSearchSchema.extend({
  view: z.enum(CALENDAR_VIEWS).optional().catch(undefined),
  date: z.iso.date().optional().catch(undefined),
  tab: z.literal("history").optional().catch(undefined),
  event: z.uuid().optional().catch(undefined),
});

export type HomeSearch = z.infer<typeof homeSearchSchema>;

export const printWeekSearchSchema = z.object({
  week: z.enum(PRINT_WEEKS).optional().catch(undefined),
});

export const checklistItemSchema = z.object({
  label: z.string().trim().min(1).max(CHECKLIST_ITEM_MAX),
});

export type ChecklistItemInput = z.infer<typeof checklistItemSchema>;
