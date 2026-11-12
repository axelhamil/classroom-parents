import { Button } from "@packages/ui/components/ui/button";
import { SettingsSection } from "@packages/ui/components/ui/settings-section";
import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SignOutDialog } from "../../../shared/auth/sign-out-dialog";
import { useSignOut } from "../../../shared/auth/use-sign-out";

export function SignOutCard() {
  const { t } = useTranslation("settings");
  const signOut = useSignOut();

  return (
    <SettingsSection title={t("signOut.title")} description={t("signOut.description")}>
      <SignOutDialog
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
        onConfirm={() => signOut.mutate()}
      />
    </SettingsSection>
  );
}
