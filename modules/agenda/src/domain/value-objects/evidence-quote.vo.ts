import { Result, ValueObject } from "@packages/ddd-kit";
import { EVIDENCE_QUOTE_MAX } from "@packages/events/agenda-contract";
import { z } from "zod";

const HIDDEN_CHARACTERS = /[\p{Cc}\p{Cf}\u{E0000}-\u{E007F}]/gu;

const evidenceQuoteSchema = z
  .string()
  .transform((quote) => quote.replace(HIDDEN_CHARACTERS, " ").replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1).max(EVIDENCE_QUOTE_MAX));

export class EvidenceQuote extends ValueObject<string> {
  protected validate(value: string): Result<string> {
    const parsed = evidenceQuoteSchema.safeParse(value);
    if (!parsed.success)
      return Result.fail(`an evidence quote holds 1 to ${EVIDENCE_QUOTE_MAX} visible characters`);

    return Result.ok(parsed.data);
  }
}
