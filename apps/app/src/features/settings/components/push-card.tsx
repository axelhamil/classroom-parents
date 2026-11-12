import { Alert, AlertDescription, AlertTitle } from "@packages/ui/components/ui/alert";
import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { Hint } from "@packages/ui/components/ui/hint";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import { TypographyMuted, TypographyP } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { BellOff, BellRing, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { defaultRemindersQueryOptions } from "../../../shared/api/queries/default-reminders";
import { pushStatusQueryOptions } from "../../../shared/api/queries/push-status";
import { InstallGuide } from "../../../shared/pwa/install-guide";
import { useInstallState } from "../../../shared/pwa/use-install-state";
import {
  type PushSubscriptionState,
  usePushSubscription,
} from "../../../shared/pwa/use-push-subscription";
import { useReminderLabel } from "../../../shared/reminders/use-reminder-label";

interface PushCardProps {
  userId: string;
}

export function PushCard({ userId }: PushCardProps) {
  const { t } = useTranslation("settings");
  const { platform, standalone } = useInstallState();
  const push = usePushSubscription(userId);
  const status = useQuery(pushStatusQueryOptions(userId));
  const needsInstall = platform === "ios" && !standalone;
  const emailFallback = !push.subscribed && status.data?.live === 0;

  return (
    <SectionCard title={t("push.title")} description={t("push.description")}>
      <DefaultRemindersSummary userId={userId} />
      {needsInstall ? <InstallGuide /> : null}
      <PushControl push={push} needsInstall={needsInstall} />
      {emailFallback ? (
        <Alert>
          <Mail />
          <AlertDescription>{t("push.emailFallback")}</AlertDescription>
        </Alert>
      ) : null}
    </SectionCard>
  );
}

const LOCALE = "fr-FR";
const LIST_FORMAT = new Intl.ListFormat(LOCALE, { type: "conjunction" });

function inSentence(label: string): string {
  return label.charAt(0).toLocaleLowerCase(LOCALE) + label.slice(1);
}

function DefaultRemindersSummary({ userId }: PushCardProps) {
  const { t } = useTranslation("settings");
  const label = useReminderLabel();
  const defaults = useQuery(defaultRemindersQueryOptions(userId));
  if (!defaults.isSuccess) return null;
  if (defaults.data.length === 0) return <TypographyMuted>{t("push.noDefaults")}</TypographyMuted>;

  return (
    <TypographyMuted>
      {t("push.defaults", {
        reminders: LIST_FORMAT.format(defaults.data.map((reminder) => inSentence(label(reminder)))),
      })}
    </TypographyMuted>
  );
}

interface PushControlProps {
  push: PushSubscriptionState;
  needsInstall: boolean;
}

function PushControl({ push, needsInstall }: PushControlProps) {
  const { t } = useTranslation("settings");

  if (needsInstall) {
    return (
      <Hint text={t("push.installFirst")} className="self-start">
        <Button type="button" disabled>
          <BellRing />
          {t("push.enable")}
        </Button>
      </Hint>
    );
  }

  if (push.permission === "unsupported") {
    return (
      <Alert>
        <BellOff />
        <AlertDescription>{t("push.unsupported")}</AlertDescription>
      </Alert>
    );
  }

  if (push.permission === "denied") {
    return (
      <Alert>
        <BellOff />
        <AlertTitle>{t("push.deniedTitle")}</AlertTitle>
        <AlertDescription>{t("push.denied")}</AlertDescription>
      </Alert>
    );
  }

  if (push.subscribed) {
    return (
      <>
        <Badge>
          <BellRing />
          {t("push.enabled")}
        </Badge>
        <TypographyP>{t("push.enabledBody")}</TypographyP>
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={push.pending}
          onClick={() => void push.disable()}
        >
          {push.pending ? t("push.disabling") : t("push.disable")}
        </Button>
      </>
    );
  }

  return (
    <Button
      type="button"
      className="self-start"
      disabled={push.pending}
      onClick={() => void push.enable()}
    >
      <BellRing />
      {push.pending ? t("push.enabling") : t("push.enable")}
    </Button>
  );
}
