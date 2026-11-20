import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import { AlertsOffIcon, AlertsOnIcon, StepDoneIcon } from "@packages/ui/components/ui/icons";
import { useTranslation } from "react-i18next";
import { InstallButton } from "../../../shared/pwa/install-button";
import { InstallGuide } from "../../../shared/pwa/install-guide";
import { PushDeniedAlert } from "../../../shared/pwa/push-denied-alert";
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
        media={<StepDoneIcon />}
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
      media={<AlertsOnIcon />}
      title={t("notifications.title")}
      description={t("notifications.description")}
      actions={
        <>
          {canEnable && (
            <Button size="lg" disabled={push.pending} onClick={() => void push.enable()}>
              <AlertsOnIcon aria-hidden />
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
          <AlertsOffIcon aria-hidden />
          <AlertDescription>{tSettings("push.unsupported")}</AlertDescription>
        </Alert>
      )}
      <InstallButton />
      {push.permission === "denied" && <PushDeniedAlert />}
    </StepFrame>
  );
}
