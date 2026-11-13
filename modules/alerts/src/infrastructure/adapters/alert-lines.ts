import { DEFAULT_LOCALE, fixedT } from "@packages/i18n";
import type { AlertContext } from "../../application/ports/alert-context-reader.port";

export type AlertLineItem = Pick<AlertContext, "eventTitle" | "childLabel" | "deadlineLabel">;

export async function alertLines(
  items: AlertLineItem[],
  { withChild }: { withChild: boolean },
): Promise<string[]> {
  const t = await fixedT(DEFAULT_LOCALE, "common");
  const key = withChild ? "alertLine.withChild" : "alertLine.short";

  return items.map(({ childLabel, eventTitle, deadlineLabel }) =>
    t(key, { childLabel, eventTitle, deadline: deadlineLabel }),
  );
}
