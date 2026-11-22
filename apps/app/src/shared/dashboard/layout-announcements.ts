import type { TFunction } from "i18next";
import type { BlockSize, Bounds } from "./block-size";
import type { Draft, SizeStep } from "./layout-commands";

export function announcePosition(
  t: TFunction<"home">,
  draft: Draft,
  id: string,
  block: string,
  drawn: BlockSize,
): string {
  const index = draft.findIndex((candidate) => candidate.id === id);
  if (index < 0) return "";

  return t("keyboard.position", {
    block,
    position: index + 1,
    total: draft.length,
    w: drawn.w,
    h: drawn.h,
  });
}

/**
 * The side a size command moved, read from the rectangle drawn after it: against its largest, or
 * the bound that stopped it, or why the grid draws it past that bound.
 */
export function announceSize(
  t: TFunction<"home">,
  { axis, step }: SizeStep,
  drawn: BlockSize,
  bounds: Bounds,
  stopped: boolean,
): string {
  const value = drawn[axis];
  const max = axis === "w" ? bounds.maxW : bounds.maxH;
  const said = SAID[axis];

  if (value > max) return t(said.filling, { value });
  if (stopped) return t(step > 0 ? said.most : said.least, { value });

  return t(said.plain, { value, max });
}

const SAID = {
  w: {
    plain: "keyboard.width",
    most: "keyboard.widthMost",
    least: "keyboard.widthLeast",
    filling: "keyboard.widthFilling",
  },
  h: {
    plain: "keyboard.height",
    most: "keyboard.heightMost",
    least: "keyboard.heightLeast",
    filling: "keyboard.heightFilling",
  },
} as const;

export function announceDropped(t: TFunction<"home">): string {
  return t("keyboard.dropped");
}

export function announceCanceled(t: TFunction<"home">, draft: Draft, id: string): string {
  const position = draft.findIndex((candidate) => candidate.id === id) + 1;

  return t("keyboard.canceled", { position });
}
