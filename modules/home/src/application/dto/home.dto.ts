import { z } from "zod";
import {
  FIXED_BLOCK_SIZES,
  type FixedBlockSize,
  HOME_LAYOUT_VERSION,
  type HomeBlock,
} from "../../domain/value-objects/home-layout.vo";

const baseRevisionSchema = z.number().int().nonnegative();

const blocksInCasesBodySchema = z.object({
  v: z.literal(HOME_LAYOUT_VERSION),
  blocks: z
    .array(z.object({ id: z.string(), w: z.number().int(), h: z.number().int() }))
    .nullable(),
  baseRevision: baseRevisionSchema,
});

const blocksInFixedSizesBodySchema = z.object({
  v: z.literal(2).optional(),
  blocks: z.array(z.object({ id: z.string(), size: z.enum(FIXED_BLOCK_SIZES) })).nullable(),
  baseRevision: baseRevisionSchema,
});

export const homeLayoutBodySchema = z.union([
  blocksInCasesBodySchema,
  blocksInFixedSizesBodySchema,
]);

export const homeNoteBodySchema = z.object({ body: z.string() });

export type HomeLayoutBody = z.infer<typeof homeLayoutBodySchema>;

export interface HomeBlockDto extends HomeBlock {
  size: FixedBlockSize;
}

export interface HomeLayoutDto {
  v: typeof HOME_LAYOUT_VERSION;
  blocks: HomeBlockDto[] | null;
  revision: number;
}

export interface HomeNoteDto {
  body: string;
  updatedAt: string | null;
}
