import { Button } from "@packages/ui/components/ui/button";
import { TypographyMuted, TypographyP } from "@packages/ui/components/ui/typography";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { redirectSearchSchema } from "../../shared/auth/safe-redirect";
import { signInWithGoogleMutationOptions } from "./api/auth.mutations";
import { resolveAuthError } from "./auth-error";
import { AuthShell } from "./components/auth-shell";

export const Route = createFileRoute("/_guest/login")({
  validateSearch: redirectSearchSchema,
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation("auth");
  const { t: tErrors } = useTranslation("errors");
  const { redirect } = Route.useSearch();
  const signIn = useMutation({
    ...signInWithGoogleMutationOptions,
    onError: (error) => toast.error(resolveAuthError(error, "login.failed", t, tErrors)),
  });

  return (
    <AuthShell title={t("login.title")} description={t("login.promise")}>
      <Button size="lg" disabled={signIn.isPending} onClick={() => signIn.mutate(redirect)}>
        {signIn.isPending ? t("login.pending") : t("login.google")}
      </Button>
      <TypographyP>{t("login.readOnly")}</TypographyP>
      <TypographyMuted>{t("login.ownAccount")}</TypographyMuted>
    </AuthShell>
  );
}
