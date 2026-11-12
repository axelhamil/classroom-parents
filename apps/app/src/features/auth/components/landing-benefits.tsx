import { LandingSection, LandingSectionTitle } from "@packages/ui/components/ui/landing";
import {
  StepListContent,
  StepListDescription,
  StepListTitle,
} from "@packages/ui/components/ui/step-list";
import { AlarmClockIcon, BackpackIcon, UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

const BENEFITS = [
  { key: "family", icon: UsersIcon },
  { key: "notes", icon: BackpackIcon },
  { key: "timing", icon: AlarmClockIcon },
] as const;

export function LandingBenefits() {
  const { t } = useTranslation("auth");

  return (
    <LandingSection aria-labelledby="benefits-title">
      <LandingSectionTitle id="benefits-title">{t("landing.benefits.title")}</LandingSectionTitle>
      <ul className="grid gap-5 @2xl:grid-cols-3">
        {BENEFITS.map(({ key, icon: Icon }) => (
          <li key={key} className="flex gap-3 @2xl:flex-col">
            <Icon aria-hidden className="mt-2 size-6 shrink-0" />
            <StepListContent>
              <StepListTitle>{t(`landing.benefits.${key}.title`)}</StepListTitle>
              <StepListDescription>{t(`landing.benefits.${key}.body`)}</StepListDescription>
            </StepListContent>
          </li>
        ))}
      </ul>
    </LandingSection>
  );
}
