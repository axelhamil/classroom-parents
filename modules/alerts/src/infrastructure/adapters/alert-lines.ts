import { deadlineLine } from "@packages/i18n";
import type { AlertContext } from "../../application/ports/alert-context-reader.port";

export type AlertLineItem = Pick<AlertContext, "eventTitle" | "childLabel" | "deadline">;

interface AlertLinesOptions {
  withChild: boolean;
  dated: boolean;
}

export function alertLines(
  items: AlertLineItem[],
  { withChild, dated }: AlertLinesOptions,
): string[] {
  return items.map(({ childLabel, eventTitle, deadline }) =>
    deadlineLine({
      child: withChild ? childLabel : undefined,
      title: eventTitle,
      when: deadline,
      dated,
    }),
  );
}
