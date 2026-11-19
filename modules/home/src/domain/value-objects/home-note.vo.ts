import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

export const MAX_NOTE_LENGTH = 4000;

const homeNoteSchema = z.string().trim().min(1).max(MAX_NOTE_LENGTH);

export class HomeNote extends ValueObject<string> {
  protected validate(body: string): Result<string> {
    const parsed = homeNoteSchema.safeParse(body);
    if (!parsed.success) return Result.fail(z.prettifyError(parsed.error));

    return Result.ok(parsed.data);
  }
}
