import { DEFAULT_LOCALE, i18nFor } from "@packages/i18n";
import type { AlertContext } from "../../application/ports/alert-context-reader.port";
import type { IPushCopy, PushCopyOptions, PushText } from "../../application/ports/push-copy.port";
import { alertLines } from "./alert-lines";

const GROUP_LINES_MAX = 4;

export class I18nPushCopy implements IPushCopy {
  async forWeek(count: number): Promise<string> {
    const i18n = await i18nFor(DEFAULT_LOCALE);
    return i18n.getFixedT(DEFAULT_LOCALE, "push")("discreet.week", { count });
  }

  async forAlerts(contexts: AlertContext[], { details }: PushCopyOptions): Promise<PushText> {
    const i18n = await i18nFor(DEFAULT_LOCALE);
    const t = i18n.getFixedT(DEFAULT_LOCALE, "push");
    const [only] = contexts;
    if (!details)
      return {
        title: i18n.getFixedT(DEFAULT_LOCALE, "common")("brand"),
        body: t("discreet.body", { count: contexts.length, deadline: only?.deadlineLabel ?? "" }),
      };

    if (only && contexts.length === 1)
      return {
        title: only.eventTitle,
        body: t("alert.body", { childLabel: only.childLabel, deadline: only.deadlineLabel }),
      };

    const children = new Set(contexts.map(({ childLabel }) => childLabel));
    const count = contexts.length;
    const title =
      children.size === 1
        ? t("group.titleChild", { count, childLabel: only?.childLabel ?? "" })
        : t("group.titleChildren", { count });
    const shown = count > GROUP_LINES_MAX + 1 ? contexts.slice(0, GROUP_LINES_MAX) : contexts;
    const lines = await alertLines(shown, { withChild: children.size > 1 });
    const rest = count - shown.length;
    if (rest > 0) lines.push(t("group.more", { count: rest }));

    return { title, body: lines.join("\n") };
  }
}
