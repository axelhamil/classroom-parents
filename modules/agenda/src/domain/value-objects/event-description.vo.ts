import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

export const EVENT_DESCRIPTION_MAX = 2000;

export const eventDescriptionSchema = z.string().trim().max(EVENT_DESCRIPTION_MAX);

export class EventDescription extends ValueObject<string> {
  protected validate(value: string): Result<string> {
    const parsed = eventDescriptionSchema.safeParse(value);
    if (!parsed.success)
      return Result.fail(`an event description holds at most ${EVENT_DESCRIPTION_MAX} characters`);

    return Result.ok(parsed.data);
  }
}
