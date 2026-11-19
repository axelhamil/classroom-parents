import { Result, ValueObject } from "@packages/ddd-kit";
import { EVENT_TITLE_MAX } from "@packages/events/agenda-contract";
import { z } from "zod";

export const AMENDMENT_KINDS = ["moved", "cancelled"] as const;

export type AmendmentKind = (typeof AMENDMENT_KINDS)[number];

const eventAmendmentSchema = z.object({
  kind: z.enum(AMENDMENT_KINDS),
  reference: z.string().trim().min(1).max(EVENT_TITLE_MAX),
  referenceDate: z.iso.date().optional(),
});

export type EventAmendmentValue = z.infer<typeof eventAmendmentSchema>;

export class EventAmendment extends ValueObject<EventAmendmentValue> {
  protected validate(value: EventAmendmentValue): Result<EventAmendmentValue> {
    const parsed = eventAmendmentSchema.safeParse(value);
    if (!parsed.success) return Result.fail("invalid event amendment");

    return Result.ok(parsed.data);
  }
}
