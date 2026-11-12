import {
  LandingList,
  LandingSection,
  LandingSectionTitle,
} from "@packages/ui/components/ui/landing";
import { BellRingIcon, PencilOffIcon, UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

const PROOFS = [
  { key: "family", icon: UsersIcon },
  { key: "alerts", icon: BellRingIcon },
  { key: "readOnly", icon: PencilOffIcon },
] as const;

export function LandingProofs() {
  const { t } = useTranslation("auth");

  return (
    <LandingSection aria-labelledby="proofs-title">
      <LandingSectionTitle id="proofs-title">{t("landing.proofs.title")}</LandingSectionTitle>
      <LandingList>
        {PROOFS.map(({ key, icon: Icon }) => (
          <li key={key}>
            <Icon aria-hidden />
            {t(`landing.proofs.${key}`)}
          </li>
        ))}
      </LandingList>
    </LandingSection>
  );
}
