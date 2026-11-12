import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { BrandLink, BrandMark } from "@packages/ui/components/ui/brand-link";
import {
  LandingAction,
  LandingHeadline,
  LandingHero,
  LandingLead,
  LandingReassurance,
  LandingSection,
  LandingSectionTitle,
  LandingSheet,
} from "@packages/ui/components/ui/landing";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { cn } from "@packages/ui/libs/utils.js";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PencilOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LegalFooter } from "../../shared/components/legal-footer";
import { ThemeToggle } from "../../shared/components/theme-toggle";
import { signInWithGoogleMutationOptions } from "./api/auth.mutations";
import { loginSearchSchema } from "./auth.schema";
import { resolveAuthError } from "./auth-error";
import { GoogleSignInButton } from "./components/google-sign-in-button";
import { HowItWorks } from "./components/how-it-works";
import { LandingFaq } from "./components/landing-faq";
import { NeverList } from "./components/never-list";
import { ProductSample } from "./components/product-sample";

export const Route = createFileRoute("/_guest/login")({
  validateSearch: loginSearchSchema,
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation("auth");
  const { t: tCommon } = useTranslation("common");
  const { t: tErrors } = useTranslation("errors");
  const { redirect, error } = Route.useSearch();
  const signIn = useMutation({
    ...signInWithGoogleMutationOptions,
    onError: (error) => toast.error(resolveAuthError(error, "login.failed", t, tErrors)),
  });
  const googleButton = (
    <GoogleSignInButton
      label={t("login.google")}
      pendingLabel={t("login.pending")}
      pending={signIn.isPending}
      onSignIn={() => signIn.mutate(redirect)}
    />
  );

  return (
    <>
      <header
        className={cn(pageContainerVariants(), "flex h-app-bar items-center justify-between")}
      >
        <BrandLink asChild>
          <Link to="/login">
            <BrandMark />
            {tCommon("brand")}
          </Link>
        </BrandLink>
        <ThemeToggle />
      </header>

      <main className={cn(pageContainerVariants(), "flex flex-col pb-12")}>
        <LandingHero>
          <LandingHeadline>{t("landing.headline")}</LandingHeadline>
          <LandingLead>{t("landing.lead")}</LandingLead>
          <LandingAction>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {error === "access_denied" ? t("login.cancelled") : t("login.callbackFailed")}
                </AlertDescription>
              </Alert>
            )}
            {googleButton}
            <LandingReassurance>
              <PencilOffIcon aria-hidden />
              {t("landing.readOnly")}
            </LandingReassurance>
          </LandingAction>
        </LandingHero>

        <LandingSheet>
          <ProductSample />
          <HowItWorks />
          <NeverList />
          <LandingFaq />
          <LandingSection span="closing" aria-labelledby="closing-title">
            <LandingSectionTitle id="closing-title">
              {t("landing.closing.title")}
            </LandingSectionTitle>
            <LandingAction>{googleButton}</LandingAction>
          </LandingSection>
        </LandingSheet>
      </main>

      <LegalFooter />
    </>
  );
}
