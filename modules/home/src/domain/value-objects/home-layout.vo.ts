import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

export const HOME_LAYOUT_VERSION = 3;

export const FIXED_BLOCK_SIZES = ["s", "m", "l", "xl"] as const;

const MAX_BLOCKS = 40;

const MAX_BLOCK_WIDTH = 4;

const MAX_BLOCK_HEIGHT = 8;

const MAX_BLOCK_ID_LENGTH = 80;

const BLOCK_ID_PATTERN = /^[a-z][a-z0-9-]*(:[A-Za-z0-9_-]+)?$/;

export const homeBlockSchema = z.object({
  id: z.string().max(MAX_BLOCK_ID_LENGTH).regex(BLOCK_ID_PATTERN),
  w: z.number().int().min(1).max(MAX_BLOCK_WIDTH),
  h: z.number().int().min(1).max(MAX_BLOCK_HEIGHT),
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

export type HomeLayoutValue = z.infer<typeof homeLayoutSchema>;

export type FixedBlockSize = (typeof FIXED_BLOCK_SIZES)[number];

export interface FixedSizeBlock {
  id: string;
  size: FixedBlockSize;
}

const CASES_OF_FIXED_SIZE = {
  s: { w: 1, h: 1 },
  m: { w: 2, h: 1 },
  l: { w: 2, h: 2 },
  xl: { w: 4, h: 2 },
} as const satisfies Record<FixedBlockSize, Pick<HomeBlock, "w" | "h">>;

type Cases = Pick<HomeBlock, "w" | "h">;

export function nearestFixedSize({ w, h }: Cases): FixedBlockSize {
  const distance = (size: FixedBlockSize) =>
    (CASES_OF_FIXED_SIZE[size].w - w) ** 2 + (CASES_OF_FIXED_SIZE[size].h - h) ** 2;

  return FIXED_BLOCK_SIZES.reduce((nearest, size) =>
    distance(size) <= distance(nearest) ? size : nearest,
  );
}

export class HomeLayout extends ValueObject<HomeLayoutValue> {
  static of(blocks: HomeBlock[]): Result<HomeLayout> {
    return HomeLayout.create({ v: HOME_LAYOUT_VERSION, blocks });
  }

  static fromFixedSizes(blocks: FixedSizeBlock[]): Result<HomeLayout> {
    return HomeLayout.of(blocks.map(({ id, size }) => ({ id, ...CASES_OF_FIXED_SIZE[size] })));
  }

  protected validate(layout: HomeLayoutValue): Result<HomeLayoutValue> {
    const parsed = homeLayoutSchema.safeParse(layout);
    if (!parsed.success) return Result.fail(z.prettifyError(parsed.error));

    return Result.ok(parsed.data);
  }
}
