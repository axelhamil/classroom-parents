import { LandingSection, LandingSectionTitle } from "@packages/ui/components/ui/landing";
import {
  StepListContent,
  StepListDescription,
  StepListTitle,
} from "@packages/ui/components/ui/step-list";
import { TextLink } from "@packages/ui/components/ui/text-link";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

const QUESTIONS = ["blocked", "data", "deletion"] as const;

export function LandingFaq() {
  const { t } = useTranslation("auth");

  return (
    <LandingSection aria-labelledby="faq-title">
      <LandingSectionTitle id="faq-title">{t("landing.faq.title")}</LandingSectionTitle>
      {QUESTIONS.map((question) => (
        <StepListContent key={question}>
          <StepListTitle>{t(`landing.faq.${question}.question`)}</StepListTitle>
          <StepListDescription>{t(`landing.faq.${question}.answer`)}</StepListDescription>
          {question === "data" && (
            <TextLink asChild>
              <Link to="/legal/privacy-policy">{t("landing.faq.data.link")}</Link>
            </TextLink>
          )}
        </StepListContent>
      ))}
    </LandingSection>
  );
}
