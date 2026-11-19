import { Button } from "@packages/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/ui/dialog";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { cn } from "@packages/ui/libs/utils.js";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionAlert } from "../components/action-alert";
import { schoolToday } from "../format/school-today";
import { captureError } from "../observability/sentry";
import { InstallGuide } from "./install-guide";
import { dismissInstallInvite, installInviteDue, recordVisitDay } from "./install-invite-moment";
import { promptInstall, useInstallState } from "./use-install-state";

function useInviteDue(): [boolean, () => void] {
  const [due, setDue] = useState(() => {
    if (typeof localStorage === "undefined") return false;

    const now = new Date();
    recordVisitDay(schoolToday(now));

    return installInviteDue(now);
  });

  return [due, () => setDue(false)];
}

export function InstallInvite() {
  const { t } = useTranslation("common");
  const { platform, standalone, canPromptInstall } = useInstallState();
  const [due, hide] = useInviteDue();
  const [guideOpen, setGuideOpen] = useState(false);
  const installable = canPromptInstall || platform === "ios";

  if (!due || standalone || !installable) return null;

  const later = () => {
    dismissInstallInvite(new Date());
    hide();
  };
  const install = () => {
    if (platform === "ios") return setGuideOpen(true);

    void promptInstall()
      .then(hide)
      .catch((error: unknown) => captureError(error, { area: "install" }));
  };

  return (
    <div className={cn(pageContainerVariants(), "pt-4 print:hidden")}>
      <ActionAlert
        tone="info"
        title={t("installInvite.title")}
        description={t("installInvite.description")}
        action={
          <>
            <Button type="button" size="sm" onClick={install}>
              {platform === "ios" ? t("installInvite.howTo") : t("installInvite.install")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={later}>
              {t("installInvite.later")}
            </Button>
          </>
        }
      />
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent closeLabel={t("actions.close")}>
          <DialogHeader>
            <DialogTitle>{t("installInvite.title")}</DialogTitle>
            <DialogDescription>{t("installInvite.description")}</DialogDescription>
          </DialogHeader>
          <InstallGuide />
        </DialogContent>
      </Dialog>
    </div>
  );
}
