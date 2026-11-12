import {
  LandingList,
  LandingSection,
  LandingSectionTitle,
} from "@packages/ui/components/ui/landing";
import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

const NEVER = ["write", "private", "ads"] as const;

export function NeverList() {
  const { t } = useTranslation("auth");

  return (
    <LandingSection aria-labelledby="never-title">
      <LandingSectionTitle id="never-title">{t("landing.never.title")}</LandingSectionTitle>
      <LandingList>
        {NEVER.map((item) => (
          <li key={item}>
            <XIcon aria-hidden />
            {t(`landing.never.${item}`)}
          </li>
        ))}
      </LandingList>
    </LandingSection>
  );
}
