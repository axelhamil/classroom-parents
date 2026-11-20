import { Alert, AlertDescription, AlertTitle } from "@packages/ui/components/ui/alert";
import { AlertsOffIcon } from "@packages/ui/components/ui/icons";
import { useTranslation } from "react-i18next";
import { useInstallState } from "./use-install-state";

export function PushDeniedAlert() {
  const { t } = useTranslation("settings");
  const { platform, standalone } = useInstallState();
  const steps =
    platform === "android"
      ? standalone
        ? t("push.denied.androidApp")
        : t("push.denied.androidBrowser")
      : platform === "ios"
        ? t("push.denied.ios")
        : t("push.denied.desktop");

  return (
    <Alert>
      <AlertsOffIcon aria-hidden />
      <AlertTitle>{t("push.deniedTitle")}</AlertTitle>
      <AlertDescription>{steps}</AlertDescription>
    </Alert>
  );
}
