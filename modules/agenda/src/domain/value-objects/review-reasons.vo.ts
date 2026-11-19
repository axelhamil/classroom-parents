import { Result, ValueObject } from "@packages/ddd-kit";
import { REVIEW_REASONS, type ReviewReason } from "@packages/events/agenda-contract";
import { z } from "zod";

export const reviewReasonsSchema = z
  .array(z.enum(REVIEW_REASONS))
  .transform((reasons) => [...new Set(reasons)]);

export class ReviewReasons extends ValueObject<ReviewReason[]> {
  static none(): ReviewReasons {
    return new ReviewReasons([]);
  }

  protected validate(value: ReviewReason[]): Result<ReviewReason[]> {
    const parsed = reviewReasonsSchema.safeParse(value);
    if (!parsed.success) return Result.fail(`unknown review reason in ${String(value)}`);

    return Result.ok(parsed.data);
  }
}
