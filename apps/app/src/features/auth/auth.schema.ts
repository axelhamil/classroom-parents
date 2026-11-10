import { z } from "zod";
import { redirectSearchSchema } from "../../shared/auth/safe-redirect";

export const loginSearchSchema = redirectSearchSchema.extend({
  error: z.string().optional().catch(undefined),
});
