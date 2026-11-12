import {
  EVENT_CATEGORIES,
  EVENT_DESCRIPTION_MAX,
  EVENT_TITLE_MAX,
} from "@packages/events/agenda-contract";
import { z } from "zod";
import { eventFiltersSearchSchema } from "../../shared/events/event-filters.schema";
import { CHECKLIST_ITEM_MAX } from "./hooks/use-checklist";

export const eventEditSchema = z.object({
  title: z.string().trim().min(1).max(EVENT_TITLE_MAX),
  description: z.string().trim().max(EVENT_DESCRIPTION_MAX),
  category: z.enum(EVENT_CATEGORIES),
  deadlineDate: z.iso.date(),
  deadlineTime: z.union([z.literal(""), z.iso.time({ precision: -1 })]),
});

export type EventEditInput = z.infer<typeof eventEditSchema>;

export const HOME_TABS = ["week", "upcoming", "history"] as const;

export type HomeTab = (typeof HOME_TABS)[number];

export const homeSearchSchema = eventFiltersSearchSchema.extend({
  tab: z.enum(HOME_TABS).optional().catch(undefined),
  event: z.uuid().optional().catch(undefined),
});

export type HomeSearch = z.infer<typeof homeSearchSchema>;

export const checklistItemSchema = z.object({
  label: z.string().trim().min(1).max(CHECKLIST_ITEM_MAX),
});

export type ChecklistItemInput = z.infer<typeof checklistItemSchema>;
