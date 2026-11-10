import { z } from "zod";
import type { EventFilters } from "../api/queries/events";
import { EVENT_CATEGORIES } from "./event-labels";

export const eventFiltersSearchSchema = z.object({
  category: z.enum(EVENT_CATEGORIES).optional().catch(undefined),
  childId: z.uuid().optional().catch(undefined),
});

export type EventFiltersSearch = z.infer<typeof eventFiltersSearchSchema>;

export function filtersFromSearch(search: EventFiltersSearch): EventFilters {
  return { category: search.category ?? null, childId: search.childId ?? null };
}
