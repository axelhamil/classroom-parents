import { createI18n, DEFAULT_LOCALE, loadCatalog } from "@packages/i18n";
import type { AlertContext } from "../../application/ports/alert-context-reader.port";
import type { IPushCopy, PushText } from "../../application/ports/push-copy.port";

const GROUP_LINES_MAX = 4;

export class I18nPushCopy implements IPushCopy {
  async forAlerts(contexts: AlertContext[]): Promise<PushText> {
    const i18n = await createI18n({
      locale: DEFAULT_LOCALE,
      resources: await loadCatalog(DEFAULT_LOCALE),
    });
    const t = i18n.getFixedT(DEFAULT_LOCALE, "push");
    const [only] = contexts;
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
    const lines: string[] = shown.map(({ childLabel, eventTitle, deadlineLabel }) =>
      t(children.size === 1 ? "group.line" : "group.lineWithChild", {
        childLabel,
        eventTitle,
        deadline: deadlineLabel,
      }),
    );
    const rest = count - shown.length;
    if (rest > 0) lines.push(t("group.more", { count: rest }));

    return { title, body: lines.join("\n") };
  }
}
