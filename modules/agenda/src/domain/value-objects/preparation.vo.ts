import { Result, ValueObject } from "@packages/ddd-kit";
import {
  ACTION_CURRENCIES,
  EVIDENCE_QUOTE_MAX,
  PARENT_ACTION_KINDS,
  PARENT_ACTION_LABEL_MAX,
  PARENT_ACTIONS_MAX,
} from "@packages/events/agenda-contract";
import { z } from "zod";

const HIDDEN_CHARACTERS = /[\p{Cc}\p{Cf}\u{E0000}-\u{E007F}]/gu;

const visibleText = (max: number) =>
  z
    .string()
    .transform((text) => text.replace(HIDDEN_CHARACTERS, " ").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1).max(max));

const preparationSchema = z.object({
  parentActions: z
    .array(
      z.object({
        kind: z.enum(PARENT_ACTION_KINDS),
        label: visibleText(PARENT_ACTION_LABEL_MAX),
        amountCents: z.number().int().nonnegative().nullable(),
        currency: z.enum(ACTION_CURRENCIES).nullable(),
        quote: visibleText(EVIDENCE_QUOTE_MAX),
      }),
    )
    .max(PARENT_ACTIONS_MAX),
  toBring: z
    .array(
      z.object({
        item: visibleText(PARENT_ACTION_LABEL_MAX),
        quote: visibleText(EVIDENCE_QUOTE_MAX),
      }),
    )
    .max(PARENT_ACTIONS_MAX),
});

export type PreparationValue = z.infer<typeof preparationSchema>;

/** What an announcement asks the parent to pay, sign, return or bring for a deadline, each with its quote. */
export class Preparation extends ValueObject<PreparationValue> {
  static none(): Preparation {
    return new Preparation({ parentActions: [], toBring: [] });
  }

  protected validate(value: PreparationValue): Result<PreparationValue> {
    const parsed = preparationSchema.safeParse(value);
    if (!parsed.success)
      return Result.fail(
        `a preparation holds at most ${PARENT_ACTIONS_MAX} quoted actions and ${PARENT_ACTIONS_MAX} quoted items`,
      );

    return Result.ok(parsed.data);
  }
}
