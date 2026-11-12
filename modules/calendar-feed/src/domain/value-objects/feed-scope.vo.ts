import { Option, Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

export const FEED_SCOPE_CHILDREN_MAX = 20;

export type FeedScopeValue = "all" | string[];

const feedScopeSchema = z.union([
  z.literal("all"),
  z
    .array(z.uuid())
    .min(1)
    .max(FEED_SCOPE_CHILDREN_MAX)
    .transform((ids) => [...new Set(ids)].sort()),
]);

export class FeedScope extends ValueObject<FeedScopeValue> {
  static fromChildIds(childIds: Option<string[]>): Result<FeedScope> {
    const value: FeedScopeValue = childIds.isSome() ? childIds.unwrap() : "all";
    return FeedScope.create(value);
  }

  childIds(): Option<string[]> {
    return this._value === "all" ? Option.none() : Option.some([...this._value]);
  }

  protected validate(value: FeedScopeValue): Result<FeedScopeValue> {
    const parsed = feedScopeSchema.safeParse(value);
    if (!parsed.success)
      return Result.fail(
        `a feed scope is every child or 1 to ${FEED_SCOPE_CHILDREN_MAX} child ids`,
      );

    return Result.ok(parsed.data);
  }
}
