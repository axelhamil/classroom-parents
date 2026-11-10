import { Alert, AlertDescription, AlertTitle } from "@packages/ui/components/ui/alert";
import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { Hint } from "@packages/ui/components/ui/hint";
import { SettingsSection } from "@packages/ui/components/ui/settings-section";
import { TypographyP } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { BellOff, BellRing, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useInstallState } from "../../../shared/pwa/use-install-state";
import { pushStatusQueryOptions } from "../api/settings.queries";
import { type PushSubscriptionState, usePushSubscription } from "../hooks/use-push-subscription";
import { InstallGuide } from "./install-guide";

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
    <SettingsSection title={t("push.title")} description={t("push.description")}>
      {needsInstall ? <InstallGuide /> : null}
      <PushControl push={push} needsInstall={needsInstall} />
      {emailFallback ? (
        <Alert>
          <Mail />
          <AlertDescription>{t("push.emailFallback")}</AlertDescription>
        </Alert>
      ) : null}
    </SettingsSection>
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
