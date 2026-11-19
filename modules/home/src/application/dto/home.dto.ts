import { z } from "zod";
import {
  BLOCK_HEIGHTS,
  BLOCK_WIDTHS,
  type HomeBlock,
} from "../../domain/value-objects/home-layout.vo";

export const homeLayoutBodySchema = z.object({
  blocks: z
    .array(
      z.object({
        id: z.string(),
        w: z.literal(BLOCK_WIDTHS),
        h: z.literal(BLOCK_HEIGHTS),
        hidden: z.boolean(),
      }),
    )
    .nullable(),
});

export const homeNoteBodySchema = z.object({ body: z.string() });

export interface HomeLayoutDto {
  blocks: HomeBlock[] | null;
}

export interface HomeNoteDto {
  body: string;
  updatedAt: string | null;
}
