import type { TFunction } from "i18next";

export function deadlineTitle(
  t: TFunction<"events">,
  title: string,
  childLabel: string | undefined,
): string {
  return childLabel ? t("share.deadline", { child: childLabel, title }) : title;
}
