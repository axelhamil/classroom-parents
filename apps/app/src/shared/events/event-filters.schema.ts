import { EVENT_CATEGORIES } from "@packages/events/agenda-contract";
import { z } from "zod";

export const eventFiltersSearchSchema = z.object({
  category: z.enum(EVENT_CATEGORIES).optional().catch(undefined),
  childId: z.uuid().optional().catch(undefined),
});
