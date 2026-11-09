import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

const googleEmailSchema = z.email();

export class GoogleEmail extends ValueObject<string> {
  protected validate(value: string): Result<string> {
    const parsed = googleEmailSchema.safeParse(value);
    if (!parsed.success) return Result.fail("a Google account email must be a valid address");

    return Result.ok(parsed.data);
  }
}
