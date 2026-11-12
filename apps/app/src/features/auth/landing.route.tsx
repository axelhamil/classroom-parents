import { BrandLink, BrandMark } from "@packages/ui/components/ui/brand-link";
import {
  LandingAction,
  LandingHeadline,
  LandingHero,
  LandingHeroCopy,
  LandingLead,
  LandingReassurance,
  LandingSection,
  LandingSectionTitle,
  LandingSheet,
} from "@packages/ui/components/ui/landing";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { cn } from "@packages/ui/libs/utils.js";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PencilOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LegalFooter } from "../../shared/components/legal-footer";
import { ThemeToggle } from "../../shared/components/theme-toggle";
import { GoogleSignInButton } from "./components/google-sign-in-button";
import { LandingFaq } from "./components/landing-faq";
import { LandingProofs } from "./components/landing-proofs";
import { ProductSample } from "./components/product-sample";
import { useGoogleSignIn } from "./use-google-sign-in";

export const Route = createFileRoute("/_guest/welcome")({
  component: LandingPage,
});

function LandingPage() {
  const { t } = useTranslation("auth");
  const { t: tCommon } = useTranslation("common");
  const signIn = useGoogleSignIn();

  return (
    <>
      <header
        className={cn(
          pageContainerVariants({ width: "landing" }),
          "flex h-app-bar items-center justify-between",
        )}
      >
        <BrandLink asChild>
          <Link to="/">
            <BrandMark className="size-11" />
            {tCommon("brand")}
          </Link>
        </BrandLink>
        <ThemeToggle />
      </header>

      <main
        className={cn(
          pageContainerVariants({ width: "landing" }),
          "flex flex-col overflow-x-clip pb-12",
        )}
      >
        <LandingHero>
          <LandingHeroCopy>
            <LandingHeadline>{t("landing.headline")}</LandingHeadline>
            <LandingLead>{t("landing.lead")}</LandingLead>
            <LandingAction>
              <GoogleSignInButton signIn={signIn} />
              <LandingReassurance>
                <PencilOffIcon aria-hidden />
                {t("landing.readOnly")}
              </LandingReassurance>
            </LandingAction>
          </LandingHeroCopy>
          <ProductSample />
        </LandingHero>

        <LandingSheet>
          <LandingProofs />
          <LandingFaq />
          <LandingSection span="closing" aria-labelledby="closing-title">
            <LandingSectionTitle id="closing-title">
              {t("landing.closing.title")}
            </LandingSectionTitle>
            <LandingAction>
              <GoogleSignInButton signIn={signIn} />
            </LandingAction>
          </LandingSection>
        </LandingSheet>
      </main>

      <LegalFooter />
    </>
  );
}
