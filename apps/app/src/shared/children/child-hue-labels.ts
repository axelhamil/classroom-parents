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
  9: "customize.hues.brick",
  10: "customize.hues.burgundy",
  11: "customize.hues.khaki",
  12: "customize.hues.forest",
  13: "customize.hues.petrol",
  14: "customize.hues.navy",
  15: "customize.hues.indigo",
  16: "customize.hues.plum",
} as const satisfies Record<ChildHue, string>;
