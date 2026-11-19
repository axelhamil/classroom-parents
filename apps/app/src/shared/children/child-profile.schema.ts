import { z } from "zod";
import { HUES } from "../format/child-hue";

const CHILD_LABEL_MAX = 40;

export const childProfileSchema = z.object({
  label: z.string().trim().min(1).max(CHILD_LABEL_MAX),
  color: z.literal(HUES),
});
export type ChildProfileInput = z.infer<typeof childProfileSchema>;

export type ChildProfileChanges = Partial<ChildProfileInput>;

export function profileChanges(
  current: ChildProfileInput,
  next: ChildProfileInput,
): ChildProfileChanges {
  return {
    ...(next.label !== current.label && { label: next.label }),
    ...(next.color !== current.color && { color: next.color }),
  };
}

export function hasChanges(changes: ChildProfileChanges): boolean {
  return changes.label !== undefined || changes.color !== undefined;
}
