import type { ChildDto } from "../api/queries/children";

export const HUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const;

export type ChildHue = (typeof HUES)[number];

export function childHue(children: readonly ChildDto[], childId: string): ChildHue {
  const color = children.find((child) => child.id === childId)?.color;

  return HUES.find((hue) => hue === color) ?? 1;
}

export type DeadlineSurface = "tint" | "paper";

export function deadlineSurface(children: readonly ChildDto[]): DeadlineSurface {
  return children.length > 1 ? "tint" : "paper";
}

export function childLabelOf(children: readonly ChildDto[], childId: string): string {
  return children.find((child) => child.id === childId)?.label ?? "";
}
