import { z } from "zod";
import { BLOCK_SIZES, type HomeBlock } from "../../domain/value-objects/home-layout.vo";

export const homeLayoutBodySchema = z.object({
  blocks: z.array(z.object({ id: z.string(), size: z.enum(BLOCK_SIZES) })).nullable(),
  baseRevision: z.number().int().nonnegative(),
});

export const homeNoteBodySchema = z.object({ body: z.string() });

export type HomeLayoutBody = z.infer<typeof homeLayoutBodySchema>;

export interface HomeLayoutDto {
  blocks: HomeBlock[] | null;
  revision: number;
}

export interface HomeNoteDto {
  body: string;
  updatedAt: string | null;
}
