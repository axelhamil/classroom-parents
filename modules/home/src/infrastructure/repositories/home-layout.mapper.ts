import { Option, Result } from "@packages/ddd-kit";
import { z } from "zod";
import {
  type BlockSize,
  type HomeBlock,
  HomeLayout,
  homeLayoutSchema,
} from "../../domain/value-objects/home-layout.vo";

const SIZE_OF_LEGACY_WIDTH = { 3: "s", 4: "m", 6: "l", 8: "l", 12: "xl" } as const satisfies Record<
  number,
  BlockSize
>;

const legacyBlockSchema = z.object({
  id: z.string(),
  w: z.literal([3, 4, 6, 8, 12]),
  hidden: z.boolean(),
});

const legacyLayoutSchema = z.array(legacyBlockSchema);

type LegacyBlock = z.infer<typeof legacyBlockSchema>;

function shownBlocksOf(legacy: LegacyBlock[]): HomeBlock[] {
  return legacy
    .filter(({ hidden }) => !hidden)
    .map(({ id, w }) => ({ id, size: SIZE_OF_LEGACY_WIDTH[w] }));
}

function layoutOf(stored: unknown): Result<HomeLayout> {
  const legacy = legacyLayoutSchema.safeParse(stored);
  if (legacy.success) return HomeLayout.of(shownBlocksOf(legacy.data));

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
