import { z } from "zod";

export const requestDeletionBodySchema = z.object({
  password: z.string().min(1),
});
