import type { ChildDto } from "../api/queries/children";

export type ChildHue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const HUES = [1, 2, 3, 4, 5, 6, 7, 8] as const satisfies readonly ChildHue[];

export function childHue(children: readonly ChildDto[], childId: string): ChildHue {
  const color = children.find((child) => child.id === childId)?.color;

  return HUES.find((hue) => hue === color) ?? 1;
}

export function childLabelOf(children: readonly ChildDto[], childId: string): string {
  return children.find((child) => child.id === childId)?.label ?? "";
}
