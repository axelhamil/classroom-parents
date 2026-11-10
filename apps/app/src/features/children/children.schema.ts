import { z } from "zod";

const CHILD_LABEL_MAX = 40;

export const renameChildSchema = z.object({
  label: z.string().trim().min(1).max(CHILD_LABEL_MAX),
});
export type RenameChildFormInput = z.infer<typeof renameChildSchema>;

export const childrenSearchSchema = z.object({
  reconnect: z.uuid().optional().catch(undefined),
});

export const newChildSearchSchema = z.object({
  linked: z.coerce.number().int().optional().catch(undefined),
});

export const linkErrorSearchSchema = z.object({
  error: z.string().optional().catch(undefined),
  error_description: z.string().optional().catch(undefined),
});
export type LinkErrorSearch = z.infer<typeof linkErrorSearchSchema>;
