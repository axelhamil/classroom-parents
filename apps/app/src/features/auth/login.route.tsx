import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import {
  LandingHeadline,
  LandingLead,
  LandingSection,
  LandingSectionTitle,
} from "@packages/ui/components/ui/landing";
import { TypographyMuted, TypographyP } from "@packages/ui/components/ui/typography";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { signInWithGoogleMutationOptions } from "./api/auth.mutations";
import { loginSearchSchema } from "./auth.schema";
import { resolveAuthError } from "./auth-error";
import { AuthShell } from "./components/auth-shell";
import { GoogleSignInButton } from "./components/google-sign-in-button";
import { HowItWorks } from "./components/how-it-works";
import { LandingBenefits } from "./components/landing-benefits";
import { LandingFaq } from "./components/landing-faq";
import { ProductSample } from "./components/product-sample";
import { ReadOnlyPromise } from "./components/read-only-promise";

export const Route = createFileRoute("/_guest/login")({
  validateSearch: loginSearchSchema,
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation("auth");
  const { t: tErrors } = useTranslation("errors");
  const { redirect, error } = Route.useSearch();
  const signIn = useMutation({
    ...signInWithGoogleMutationOptions,
    onError: (error) => toast.error(resolveAuthError(error, "login.failed", t, tErrors)),
  });
  const startSignIn = () => signIn.mutate(redirect);

  return (
    <AuthShell
      hero={
        <>
          <LandingHeadline>{t("landing.headline")}</LandingHeadline>
          <LandingLead>{t("landing.lead")}</LandingLead>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {error === "access_denied" ? t("login.cancelled") : t("login.callbackFailed")}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col items-start gap-3">
            <GoogleSignInButton
              label={t("login.google")}
              pendingLabel={t("login.pending")}
              pending={signIn.isPending}
              onSignIn={startSignIn}
            />
            <TypographyMuted>{t("login.ownAccount")}</TypographyMuted>
          </div>
          <TypographyP>
            {t("landing.readOnly")} {t("landing.audience")}
          </TypographyP>
        </>
      }
    >
      <ProductSample />
      <LandingBenefits />
      <HowItWorks />
      <ReadOnlyPromise />
      <LandingFaq />
      <LandingSection surface="sheet" aria-labelledby="closing-title">
        <LandingSectionTitle id="closing-title">{t("landing.closing.title")}</LandingSectionTitle>
        <TypographyP>{t("landing.closing.body")}</TypographyP>
        <GoogleSignInButton
          label={t("landing.closing.action")}
          pendingLabel={t("login.pending")}
          pending={signIn.isPending}
          onSignIn={startSignIn}
        />
      </LandingSection>
    </AuthShell>
  );
}
