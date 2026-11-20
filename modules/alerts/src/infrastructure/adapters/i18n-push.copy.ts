import { DEFAULT_LOCALE, deadlineLine, fixedT, relativeDeadlineLabel } from "@packages/i18n";
import type { AlertContext } from "../../application/ports/alert-context-reader.port";
import type {
  DigestSummary,
  IPushCopy,
  PushCopyOptions,
  PushText,
} from "../../application/ports/push-copy.port";
import { alertLines } from "./alert-lines";

const GROUP_LINES_MAX = 4;

type PushT = Awaited<ReturnType<typeof pushT>>;

function pushT() {
  return fixedT(DEFAULT_LOCALE, "push");
}

async function brand(): Promise<string> {
  return (await fixedT(DEFAULT_LOCALE, "common"))("brand");
}

function digestCounts(t: PushT, { total, children }: DigestSummary): string {
  const [only] = children;
  if (only && children.length === 1)
    return t("digest.oneChild", { count: total, childLabel: only.label });

  const perChild = children
    .map(({ label, count }) => t("digest.childCount", { count, childLabel: label }))
    .join(", ");

  return t("digest.children", { count: total, perChild });
}

function digestNext(t: PushT, { next, today }: DigestSummary): string {
  const line = deadlineLine({ title: next.title, when: { date: next.date, today } });

  return t("digest.next", { line });
}

function groupTitle(t: PushT, contexts: AlertContext[], children: Set<string>): string {
  const count = contexts.length;
  if (children.size > 1) return t("group.titleChildren", { count });

  return t("group.titleChild", { count, childLabel: contexts[0]?.childLabel ?? "" });
}

function groupBody(t: PushT, contexts: AlertContext[], withChild: boolean): string {
  const count = contexts.length;
  const shown = count > GROUP_LINES_MAX + 1 ? contexts.slice(0, GROUP_LINES_MAX) : contexts;
  const lines = alertLines(shown, { withChild, dated: false });
  const rest = count - shown.length;
  if (rest > 0) lines.push(t("group.more", { count: rest }));

  return lines.join("\n");
}

export class I18nPushCopy implements IPushCopy {
  async forDigest(summary: DigestSummary, { details }: PushCopyOptions): Promise<PushText> {
    const t = await pushT();
    const title = t("digest.title");
    if (!details) return { title, body: t("digest.discreet", { count: summary.total }) };

    const body = t("digest.summary", {
      counts: digestCounts(t, summary),
      next: digestNext(t, summary),
    });

    return { title, body };
  }

  async forAccessLoss(childLabel: string, { details }: PushCopyOptions): Promise<PushText> {
    const t = await pushT();
    if (!details) return { title: await brand(), body: t("accessLoss.discreetBody") };

    return { title: t("accessLoss.title"), body: t("accessLoss.body", { childLabel }) };
  }

  async forAlerts(contexts: AlertContext[], { details }: PushCopyOptions): Promise<PushText> {
    const t = await pushT();
    const [only] = contexts;
    const deadline = only ? relativeDeadlineLabel(only.deadline) : "";
    if (!details)
      return {
        title: await brand(),
        body: t("discreet.body", { count: contexts.length, deadline }),
      };

    if (only && contexts.length === 1)
      return {
        title: only.eventTitle,
        body: t("alert.body", { childLabel: only.childLabel, deadline }),
      };

    const children = new Set(contexts.map(({ childLabel }) => childLabel));

    return {
      title: groupTitle(t, contexts, children),
      body: groupBody(t, contexts, children.size > 1),
    };
  }
}
