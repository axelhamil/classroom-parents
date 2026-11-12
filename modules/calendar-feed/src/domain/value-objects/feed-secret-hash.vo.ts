import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

const feedSecretHashSchema = z.string().regex(/^[0-9a-f]{64}$/);

export class FeedSecretHash extends ValueObject<string> {
  protected validate(value: string): Result<string> {
    const parsed = feedSecretHashSchema.safeParse(value);
    if (!parsed.success) return Result.fail("a feed secret hash is a SHA-256 digest in hex");

    return Result.ok(parsed.data);
  }
}
