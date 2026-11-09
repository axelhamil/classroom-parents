import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

export const CHILD_LABEL_MAX = 40;

export const childLabelSchema = z.string().trim().min(1).max(CHILD_LABEL_MAX);

export class ChildLabel extends ValueObject<string> {
  protected validate(value: string): Result<string> {
    const parsed = childLabelSchema.safeParse(value);
    if (!parsed.success)
      return Result.fail(`a child label holds 1 to ${CHILD_LABEL_MAX} characters`);

    return Result.ok(parsed.data);
  }
}
