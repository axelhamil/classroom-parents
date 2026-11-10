import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

export const EVENT_CATEGORIES = [
  "assessment",
  "homework",
  "school_trip",
  "swimming",
  "document_due",
] as const;

export const eventCategorySchema = z.enum(EVENT_CATEGORIES);

export type EventCategoryValue = z.infer<typeof eventCategorySchema>;

export class EventCategory extends ValueObject<EventCategoryValue> {
  protected validate(value: EventCategoryValue): Result<EventCategoryValue> {
    const parsed = eventCategorySchema.safeParse(value);
    if (!parsed.success) return Result.fail(`unknown event category ${String(value)}`);

    return Result.ok(parsed.data);
  }
}
