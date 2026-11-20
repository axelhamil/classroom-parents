/**
 * The class names every primitive shares to paint a child's hue, one map per
 * role, keyed by the hue index (`1..16`). The strings stay literal on purpose:
 * Tailwind only generates the utilities it reads verbatim in the source, so a
 * class built from a template would never reach the stylesheet.
 */

/** The solid hue (`bg-child-N`): avatar initials, banner, colour swatch. */
export const childHueFill = {
  1: "bg-child-1",
  2: "bg-child-2",
  3: "bg-child-3",
  4: "bg-child-4",
  5: "bg-child-5",
  6: "bg-child-6",
  7: "bg-child-7",
  8: "bg-child-8",
  9: "bg-child-9",
  10: "bg-child-10",
  11: "bg-child-11",
  12: "bg-child-12",
  13: "bg-child-13",
  14: "bg-child-14",
  15: "bg-child-15",
  16: "bg-child-16",
} as const;

/** The light surface of the hue (`bg-child-N-container`): cards, stickers, calendar chips. */
export const childHueContainer = {
  1: "bg-child-1-container",
  2: "bg-child-2-container",
  3: "bg-child-3-container",
  4: "bg-child-4-container",
  5: "bg-child-5-container",
  6: "bg-child-6-container",
  7: "bg-child-7-container",
  8: "bg-child-8-container",
  9: "bg-child-9-container",
  10: "bg-child-10-container",
  11: "bg-child-11-container",
  12: "bg-child-12-container",
  13: "bg-child-13-container",
  14: "bg-child-14-container",
  15: "bg-child-15-container",
  16: "bg-child-16-container",
} as const;

/** A child's colour index, the one type every hue prop of the kit accepts. */
export type ChildTone = keyof typeof childHueFill;

/** The thin edge in the child's hue (the `shadow-stripe` utility) that marks a deadline laid on neutral paper. */
export const childHueEdge = {
  1: "shadow-stripe [--stripe-color:var(--child-1)]",
  2: "shadow-stripe [--stripe-color:var(--child-2)]",
  3: "shadow-stripe [--stripe-color:var(--child-3)]",
  4: "shadow-stripe [--stripe-color:var(--child-4)]",
  5: "shadow-stripe [--stripe-color:var(--child-5)]",
  6: "shadow-stripe [--stripe-color:var(--child-6)]",
  7: "shadow-stripe [--stripe-color:var(--child-7)]",
  8: "shadow-stripe [--stripe-color:var(--child-8)]",
  9: "shadow-stripe [--stripe-color:var(--child-9)]",
  10: "shadow-stripe [--stripe-color:var(--child-10)]",
  11: "shadow-stripe [--stripe-color:var(--child-11)]",
  12: "shadow-stripe [--stripe-color:var(--child-12)]",
  13: "shadow-stripe [--stripe-color:var(--child-13)]",
  14: "shadow-stripe [--stripe-color:var(--child-14)]",
  15: "shadow-stripe [--stripe-color:var(--child-15)]",
  16: "shadow-stripe [--stripe-color:var(--child-16)]",
} as const satisfies Record<ChildTone, string>;

/** Every hue index, for the variant tables that pair a hue with another variant. */
export const CHILD_TONES = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
] as const satisfies readonly ChildTone[];
