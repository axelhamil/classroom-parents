import { z } from "zod";
import { passwordSchema } from "../../shared/auth/auth.schema";

export const requestDeletionWithPasswordSchema = z.object({
  password: passwordSchema,
});
export type RequestDeletionWithPasswordInput = z.infer<typeof requestDeletionWithPasswordSchema>;
