import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";
import { AMENDMENT_KINDS, type AmendmentKind } from "./event-amendment.vo";

const amendReasonSchema = z.enum(AMENDMENT_KINDS);

export class AmendReason extends ValueObject<AmendmentKind> {
  static of(kind: AmendmentKind): AmendReason {
    return new AmendReason(kind);
  }

  protected validate(value: AmendmentKind): Result<AmendmentKind> {
    const parsed = amendReasonSchema.safeParse(value);
    if (!parsed.success) return Result.fail(`unknown amend reason ${String(value)}`);

    return Result.ok(parsed.data);
  }
}
