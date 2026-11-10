import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@packages/ui/components/ui/alert-dialog";
import { Button } from "@packages/ui/components/ui/button";
import { SettingsSection } from "@packages/ui/components/ui/settings-section";
import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSignOut } from "../../../shared/auth/use-sign-out";

export function SignOutCard() {
  const { t } = useTranslation(["settings", "common"]);
  const signOut = useSignOut();

  return (
    <SettingsSection title={t("signOut.title")} description={t("signOut.description")}>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={signOut.isPending}
          >
            <LogOut />
            {signOut.isPending ? t("signOut.pending") : t("signOut.action")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("signOut.dialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("signOut.dialogDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => signOut.mutate()}>
              {t("signOut.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
