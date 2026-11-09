import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { redirectSearchSchema } from "../../shared/auth/safe-redirect";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { SignInForm } from "./forms/sign-in-form";

export const Route = createFileRoute("/_guest/sign-in")({
  validateSearch: redirectSearchSchema,
  component: SignInPage,
});

function SignInPage() {
  const { t } = useTranslation("auth");
  const { redirect } = Route.useSearch();

  return (
    <AuthShell
      title={t("signIn.title")}
      description={t("signIn.description")}
      footer={
        <AuthShellFooter
          lead={t("signIn.noAccountYet")}
          link={
            <Link to="/sign-up" search={{ redirect }}>
              {t("signIn.createOne")}
            </Link>
          }
        />
      }
    >
      <SignInForm redirectTo={redirect} />
    </AuthShell>
  );
}
