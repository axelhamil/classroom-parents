import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

export const BLOCK_SIZES = ["s", "m", "l", "xl"] as const;

export const HOME_LAYOUT_VERSION = 2;

const MAX_BLOCKS = 40;

const MAX_BLOCK_ID_LENGTH = 80;

const BLOCK_ID_PATTERN = /^[a-z][a-z0-9-]*(:[A-Za-z0-9_-]+)?$/;

export const homeBlockSchema = z.object({
  id: z.string().max(MAX_BLOCK_ID_LENGTH).regex(BLOCK_ID_PATTERN),
  size: z.enum(BLOCK_SIZES),
});

export const homeLayoutSchema = z.object({
  v: z.literal(HOME_LAYOUT_VERSION),
  blocks: z
    .array(homeBlockSchema)
    .max(MAX_BLOCKS)
    .refine((blocks) => new Set(blocks.map(({ id }) => id)).size === blocks.length, {
      message: "block ids must be unique",
    }),
});

export type HomeBlock = z.infer<typeof homeBlockSchema>;

export type BlockSize = HomeBlock["size"];

export type HomeLayoutValue = z.infer<typeof homeLayoutSchema>;

export class HomeLayout extends ValueObject<HomeLayoutValue> {
  static of(blocks: HomeBlock[]): Result<HomeLayout> {
    return HomeLayout.create({ v: HOME_LAYOUT_VERSION, blocks });
  }

  protected validate(layout: HomeLayoutValue): Result<HomeLayoutValue> {
    const parsed = homeLayoutSchema.safeParse(layout);
    if (!parsed.success) return Result.fail(z.prettifyError(parsed.error));

    return Result.ok(parsed.data);
  }
}
