import type { TFunction } from "i18next";
import type { Draft } from "./layout-commands";

export function announcePosition(
  t: TFunction<"home">,
  draft: Draft,
  id: string,
  block: string,
): string {
  const index = draft.findIndex((candidate) => candidate.id === id);
  const placed = draft[index];
  if (!placed) return "";

  return t("keyboard.position", {
    block,
    position: index + 1,
    total: draft.length,
    size: t(`keyboard.sizes.${placed.size}`),
  });
}

export function announceDropped(t: TFunction<"home">): string {
  return t("keyboard.dropped");
}

export function announceCanceled(t: TFunction<"home">, draft: Draft, id: string): string {
  const position = draft.findIndex((candidate) => candidate.id === id) + 1;

  return t("keyboard.canceled", { position });
}
