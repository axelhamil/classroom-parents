import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

export const BLOCK_WIDTHS = [3, 4, 6, 8, 12] as const;

export const BLOCK_HEIGHTS = [1, 2, 3] as const;

const MAX_BLOCKS = 40;

const MAX_BLOCK_ID_LENGTH = 80;

const BLOCK_ID_PATTERN = /^[a-z][a-z0-9-]*(:[A-Za-z0-9_-]+)?$/;

const homeBlockSchema = z.object({
  id: z.string().max(MAX_BLOCK_ID_LENGTH).regex(BLOCK_ID_PATTERN),
  w: z.literal(BLOCK_WIDTHS),
  h: z.literal(BLOCK_HEIGHTS),
  hidden: z.boolean(),
});

export const homeLayoutSchema = z
  .array(homeBlockSchema)
  .max(MAX_BLOCKS)
  .refine((blocks) => new Set(blocks.map(({ id }) => id)).size === blocks.length, {
    message: "block ids must be unique",
  });

export type HomeBlock = z.infer<typeof homeBlockSchema>;

export class HomeLayout extends ValueObject<HomeBlock[]> {
  protected validate(blocks: HomeBlock[]): Result<HomeBlock[]> {
    const parsed = homeLayoutSchema.safeParse(blocks);
    if (!parsed.success) return Result.fail(z.prettifyError(parsed.error));

    return Result.ok(parsed.data);
  }
}
