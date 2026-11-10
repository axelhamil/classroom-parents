import { Button } from "@packages/ui/components/ui/button";
import { DestructiveActionDialog } from "@packages/ui/components/ui/destructive-action-dialog";
import { SettingsSection } from "@packages/ui/components/ui/settings-section";
import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSignOut } from "../../../shared/auth/use-sign-out";

export function SignOutCard() {
  const { t } = useTranslation(["settings", "common"]);
  const signOut = useSignOut();

  return (
    <SettingsSection title={t("signOut.title")} description={t("signOut.description")}>
      <DestructiveActionDialog
        trigger={
          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={signOut.isPending}
          >
            <LogOut />
            {signOut.isPending ? t("signOut.pending") : t("signOut.action")}
          </Button>
        }
        title={t("signOut.dialogTitle")}
        description={t("signOut.dialogDescription")}
        actionLabel={t("signOut.confirm")}
        actionVariant="default"
        cancelLabel={t("common:actions.cancel")}
        onConfirm={() => signOut.mutate()}
      />
    </SettingsSection>
  );
}
