import { Option, Result } from "@packages/ddd-kit";
import { z } from "zod";
import {
  FIXED_BLOCK_SIZES,
  type FixedBlockSize,
  type FixedSizeBlock,
  HomeLayout,
  homeLayoutSchema,
} from "../../domain/value-objects/home-layout.vo";

const FIXED_SIZE_OF_FIRST_WIDTH = {
  3: "s",
  4: "m",
  6: "l",
  8: "l",
  12: "xl",
} as const satisfies Record<number, FixedBlockSize>;

const firstFormatSchema = z.array(
  z.object({
    id: z.string(),
    w: z.literal([3, 4, 6, 8, 12]),
    hidden: z.boolean(),
  }),
);

const fixedSizesFormatSchema = z.object({
  v: z.literal(2),
  blocks: z.array(z.object({ id: z.string(), size: z.enum(FIXED_BLOCK_SIZES) })),
});

type FirstFormat = z.infer<typeof firstFormatSchema>;

function shownBlocksOf(first: FirstFormat): FixedSizeBlock[] {
  return first
    .filter(({ hidden }) => !hidden)
    .map(({ id, w }) => ({ id, size: FIXED_SIZE_OF_FIRST_WIDTH[w] }));
}

function layoutOf(stored: unknown): Result<HomeLayout> {
  const first = firstFormatSchema.safeParse(stored);
  if (first.success) return HomeLayout.fromFixedSizes(shownBlocksOf(first.data));

  const fixedSizes = fixedSizesFormatSchema.safeParse(stored);
  if (fixedSizes.success) return HomeLayout.fromFixedSizes(fixedSizes.data.blocks);

  const current = homeLayoutSchema.safeParse(stored);
  if (!current.success) return Result.fail(z.prettifyError(current.error));

  return HomeLayout.create(current.data);
}

export const homeLayoutMapper = {
  toDomain(stored: unknown): Result<Option<HomeLayout>> {
    if (stored === null) return Result.ok(Option.none());

    return layoutOf(stored).map((layout) => Option.some(layout));
  },

  toPersistence(layout: Option<HomeLayout>): unknown {
    return layout.map(({ value }) => value).toNull();
  },
};
