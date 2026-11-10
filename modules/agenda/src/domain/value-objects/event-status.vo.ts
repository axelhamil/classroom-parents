import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

export const EVENT_STATUSES = ["confirmed", "needs_review"] as const;

const eventStatusSchema = z.enum(EVENT_STATUSES);

export type EventStatusValue = z.infer<typeof eventStatusSchema>;

export class EventStatus extends ValueObject<EventStatusValue> {
  static confirmed(): EventStatus {
    return new EventStatus("confirmed");
  }

  static of(needsReview: boolean): EventStatus {
    return new EventStatus(needsReview ? "needs_review" : "confirmed");
  }

  needsReview(): boolean {
    return this.value === "needs_review";
  }

  protected validate(value: EventStatusValue): Result<EventStatusValue> {
    const parsed = eventStatusSchema.safeParse(value);
    if (!parsed.success) return Result.fail(`unknown event status ${String(value)}`);

    return Result.ok(parsed.data);
  }
}
