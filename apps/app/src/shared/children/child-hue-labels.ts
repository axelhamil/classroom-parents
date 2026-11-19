import type { ChildHue } from "../format/child-hue";

export const CHILD_HUE_LABEL_KEYS = {
  1: "customize.hues.teal",
  2: "customize.hues.blue",
  3: "customize.hues.violet",
  4: "customize.hues.raspberry",
  5: "customize.hues.orange",
  6: "customize.hues.olive",
  7: "customize.hues.green",
  8: "customize.hues.slate",
} as const satisfies Record<ChildHue, string>;
