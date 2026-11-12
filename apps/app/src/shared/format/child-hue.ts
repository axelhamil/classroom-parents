import type { ChildDto } from "../api/queries/children";

export type ChildHue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const HUES = [1, 2, 3, 4, 5, 6, 7, 8] as const satisfies readonly ChildHue[];

export function childHue(children: readonly ChildDto[], childId: string): ChildHue {
  const index = children.findIndex((child) => child.id === childId);

  return HUES[Math.max(index, 0) % HUES.length] ?? 1;
}

export function childLabelOf(children: readonly ChildDto[], childId: string): string {
  return children.find((child) => child.id === childId)?.label ?? "";
}
