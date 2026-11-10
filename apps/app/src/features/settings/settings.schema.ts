import { z } from "zod";
import { REAUTH_FAILED } from "../rgpd/hooks/use-google-reauth";

export const settingsSearchSchema = z.object({
  reauth: z.literal(REAUTH_FAILED).optional().catch(undefined),
  error: z.string().optional().catch(undefined),
});
