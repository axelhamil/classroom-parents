import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

export const EVENT_SOURCES = ["announcement", "coursework"] as const;

const eventSourceSchema = z.enum(EVENT_SOURCES);

export type EventSourceValue = z.infer<typeof eventSourceSchema>;

export class EventSource extends ValueObject<EventSourceValue> {
  static announcement(): EventSource {
    return new EventSource("announcement");
  }

  static coursework(): EventSource {
    return new EventSource("coursework");
  }

  protected validate(value: EventSourceValue): Result<EventSourceValue> {
    const parsed = eventSourceSchema.safeParse(value);
    if (!parsed.success) return Result.fail(`unknown event source ${String(value)}`);

    return Result.ok(parsed.data);
  }
}
