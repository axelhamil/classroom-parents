import { Result, ValueObject } from "@packages/ddd-kit";
import { EVENT_TITLE_MAX } from "@packages/events/agenda-contract";
import { z } from "zod";

export const eventTitleSchema = z.string().trim().min(1).max(EVENT_TITLE_MAX);

export class EventTitle extends ValueObject<string> {
  protected validate(value: string): Result<string> {
    const parsed = eventTitleSchema.safeParse(value);
    if (!parsed.success)
      return Result.fail(`an event title holds 1 to ${EVENT_TITLE_MAX} characters`);

    return Result.ok(parsed.data);
  }
}
