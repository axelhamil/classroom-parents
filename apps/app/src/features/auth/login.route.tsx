import { TypographyP } from "@packages/ui/components/ui/typography";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { redirectSearchSchema } from "../../shared/auth/safe-redirect";
import { AuthShell } from "./components/auth-shell";

export const Route = createFileRoute("/_guest/login")({
  validateSearch: redirectSearchSchema,
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation("auth");

  return (
    <AuthShell title={t("login.title")} description={t("login.promise")}>
      <TypographyP>{t("login.readOnly")}</TypographyP>
    </AuthShell>
  );
}
