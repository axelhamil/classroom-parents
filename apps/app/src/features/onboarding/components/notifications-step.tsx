import { Alert, AlertDescription, AlertTitle } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import { BellOff, BellRing, CircleCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { InstallGuide } from "../../../shared/pwa/install-guide";
import { useInstallState } from "../../../shared/pwa/use-install-state";
import { usePushSubscription } from "../../../shared/pwa/use-push-subscription";
import { StepFrame } from "./step-frame";

export interface NotificationsStepProps {
  userId: string;
  onNext: () => void;
}

export function NotificationsStep({ userId, onNext }: NotificationsStepProps) {
  const { t } = useTranslation("onboarding");
  const { t: tSettings } = useTranslation("settings");
  const { platform, standalone } = useInstallState();
  const push = usePushSubscription(userId);
  const needsInstall = platform === "ios" && !standalone;
  const canEnable =
    !needsInstall && (push.permission === "default" || push.permission === "granted");

  if (push.subscribed) {
    return (
      <StepFrame
        media={<CircleCheck />}
        mediaTone="success"
        title={t("notifications.title")}
        description={t("notifications.enabled")}
        actions={
          <Button size="lg" onClick={onNext}>
            {t("notifications.next")}
          </Button>
        }
      />
    );
  }

  return (
    <StepFrame
      media={<BellRing />}
      title={t("notifications.title")}
      description={t("notifications.description")}
      actions={
        <>
          {canEnable && (
            <Button size="lg" disabled={push.pending} onClick={() => void push.enable()}>
              <BellRing aria-hidden />
              {push.pending ? t("notifications.enabling") : t("notifications.enable")}
            </Button>
          )}
          <Button size="lg" variant={canEnable ? "ghost" : "default"} onClick={onNext}>
            {t("notifications.skip")}
          </Button>
        </>
      }
    >
      {needsInstall && <InstallGuide />}
      {push.permission === "unsupported" && (
        <Alert>
          <BellOff aria-hidden />
          <AlertDescription>{tSettings("push.unsupported")}</AlertDescription>
        </Alert>
      )}
      {push.permission === "denied" && (
        <Alert>
          <BellOff aria-hidden />
          <AlertTitle>{tSettings("push.deniedTitle")}</AlertTitle>
          <AlertDescription>{tSettings("push.denied")}</AlertDescription>
        </Alert>
      )}
    </StepFrame>
  );
}
