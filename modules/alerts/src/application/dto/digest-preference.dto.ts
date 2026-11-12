import { z } from "zod";

export interface DigestPreferenceDto {
  enabled: boolean;
}

export const digestPreferenceBodySchema = z.object({ enabled: z.boolean() });
