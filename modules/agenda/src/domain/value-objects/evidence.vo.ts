import { Result, ValueObject } from "@packages/ddd-kit";
import { EVIDENCE_CONTEXT_MAX, EVIDENCE_QUOTE_MAX } from "@packages/events/agenda-contract";
import { z } from "zod";

const HIDDEN_CHARACTERS = /[\p{Cc}\p{Cf}\u{E0000}-\u{E007F}]/gu;

const visibleRun = z
  .string()
  .transform((text) => text.replace(HIDDEN_CHARACTERS, " ").replace(/\s+/g, " "));

const visibleText = visibleRun.transform((text) => text.trim());

const evidenceSchema = z
  .object({
    quote: visibleText.pipe(z.string().min(1).max(EVIDENCE_QUOTE_MAX)),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    before: visibleRun.pipe(z.string().max(EVIDENCE_CONTEXT_MAX)),
    after: visibleRun.pipe(z.string().max(EVIDENCE_CONTEXT_MAX)),
  })
  .refine(({ start, end }) => end > start);

export type EvidenceValue = z.infer<typeof evidenceSchema>;

export class Evidence extends ValueObject<EvidenceValue> {
  protected validate(value: EvidenceValue): Result<EvidenceValue> {
    const parsed = evidenceSchema.safeParse(value);
    if (!parsed.success)
      return Result.fail(
        `an evidence holds a visible quote of 1 to ${EVIDENCE_QUOTE_MAX} characters, bounded in the announcement`,
      );

    return Result.ok(parsed.data);
  }
}
