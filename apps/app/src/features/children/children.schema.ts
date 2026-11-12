import { z } from "zod";

export const childrenSearchSchema = z.object({
  reconnect: z.uuid().optional().catch(undefined),
});

export const linkErrorSearchSchema = z.object({
  error: z.string().optional().catch(undefined),
  error_description: z.string().optional().catch(undefined),
  reconnect: z.uuid().optional().catch(undefined),
});
