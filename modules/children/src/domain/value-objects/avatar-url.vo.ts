import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

const AVATAR_URL_MAX = 2048;

const avatarUrlSchema = z.url({ protocol: /^https$/ }).max(AVATAR_URL_MAX);

export class AvatarUrl extends ValueObject<string> {
  protected validate(value: string): Result<string> {
    const parsed = avatarUrlSchema.safeParse(value);
    if (!parsed.success)
      return Result.fail(`an avatar is an https URL of at most ${AVATAR_URL_MAX} characters`);

    return Result.ok(parsed.data);
  }
}
