import { z } from "zod";

const CHILD_LABEL_MAX = 40;

export const childLabelSchema = z.object({
  label: z.string().trim().min(1).max(CHILD_LABEL_MAX),
});
export type ChildLabelInput = z.infer<typeof childLabelSchema>;
