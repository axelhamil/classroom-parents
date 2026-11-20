import { Button } from "@packages/ui/components/ui/button";
import { InstallIcon } from "@packages/ui/components/ui/icons";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useTranslation } from "react-i18next";
import { captureError } from "../observability/sentry";
import { promptInstall, useInstallState } from "./use-install-state";

export function InstallButton() {
  const { t } = useTranslation("settings");
  const { canPromptInstall, standalone } = useInstallState();
  if (!canPromptInstall || standalone) return null;

  return (
    <>
      <TypographyMuted>{t("push.installHint")}</TypographyMuted>
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() =>
          void promptInstall().catch((error: unknown) => captureError(error, { area: "push" }))
        }
      >
        <InstallIcon aria-hidden />
        {t("push.install")}
      </Button>
    </>
  );
}
