import { Button } from "@packages/ui/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useSignOut } from "../../shared/auth/use-sign-out";
import { Screen } from "../../shared/layout/screen";

export const Route = createFileRoute("/_protected/_shell/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const signOut = useSignOut();

  return (
    <Screen title={t("home.title")} description={t("home.description")}>
      <Button
        variant="outline"
        className="w-fit"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        {signOut.isPending ? tCommon("userMenu.signingOut") : tCommon("userMenu.signOut")}
      </Button>
    </Screen>
  );
}
