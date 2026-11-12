import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { BrandMark } from "@packages/ui/components/ui/brand-link";
import { LandingAction, LandingReassurance, SignInPanel } from "@packages/ui/components/ui/landing";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { TextLink } from "@packages/ui/components/ui/text-link";
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PencilOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LegalFooter } from "../../shared/components/legal-footer";
import { ThemeToggle } from "../../shared/components/theme-toggle";
import { loginSearchSchema } from "./auth.schema";
import { GoogleSignInButton } from "./components/google-sign-in-button";
import { useGoogleSignIn } from "./use-google-sign-in";

export const Route = createFileRoute("/_guest/login")({
  validateSearch: loginSearchSchema,
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation("auth");
  const { redirect, error } = Route.useSearch();
  const signIn = useGoogleSignIn(redirect);

  return (
    <>
      <meta name="robots" content="noindex" />
      <header className={cn(pageContainerVariants(), "flex h-app-bar items-center justify-end")}>
        <ThemeToggle />
      </header>

      <main
        className={cn(
          pageContainerVariants({ width: "form" }),
          "flex min-h-[calc(100svh-var(--app-bar-height)*3)] flex-col justify-center pb-12",
        )}
      >
        <SignInPanel>
          <BrandMark className="size-16" />
          <TypographyH1 variant="page">{t("login.title")}</TypographyH1>
          <LandingAction>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {error === "access_denied" ? t("login.cancelled") : t("login.callbackFailed")}
                </AlertDescription>
              </Alert>
            )}
            <GoogleSignInButton signIn={signIn} />
            <LandingReassurance>
              <PencilOffIcon aria-hidden />
              {t("landing.readOnly")}
            </LandingReassurance>
          </LandingAction>
          <TextLink asChild>
            <Link to="/">{t("login.discover")}</Link>
          </TextLink>
        </SignInPanel>
      </main>

      <LegalFooter />
    </>
  );
}
