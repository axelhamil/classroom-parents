import { LandingSection, LandingSectionTitle } from "@packages/ui/components/ui/landing";
import {
  StepList,
  StepListContent,
  StepListDescription,
  StepListItem,
  StepListTitle,
} from "@packages/ui/components/ui/step-list";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useTranslation } from "react-i18next";

const STEPS = ["signIn", "addChild", "alerts"] as const;

export function HowItWorks() {
  const { t } = useTranslation("auth");

  return (
    <LandingSection aria-labelledby="how-it-works">
      <LandingSectionTitle id="how-it-works">{t("landing.steps.title")}</LandingSectionTitle>
      <TypographyMuted>{t("landing.steps.intro")}</TypographyMuted>
      <StepList>
        {STEPS.map((step) => (
          <StepListItem key={step}>
            <StepListContent>
              <StepListTitle>{t(`landing.steps.${step}.title`)}</StepListTitle>
              <StepListDescription>{t(`landing.steps.${step}.body`)}</StepListDescription>
            </StepListContent>
          </StepListItem>
        ))}
      </StepList>
    </LandingSection>
  );
}
