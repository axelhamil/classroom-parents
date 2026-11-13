import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { POLICY_TITLE_KEYS, type PolicyType } from "../../shared/legal/policy-labels";
import { LegalScreen } from "./legal-screen";
import { PrivacyPolicyBody, TermsBody } from "./policies/fr";

const POLICY_BODIES: Record<PolicyType, () => ReactElement> = {
  privacy: PrivacyPolicyBody,
  terms: TermsBody,
};

interface PolicyDocViewProps {
  type: PolicyType;
}

export function PolicyDocView({ type }: PolicyDocViewProps) {
  const { t } = useTranslation("common");
  const Body = POLICY_BODIES[type];

  return (
    <LegalScreen title={t(POLICY_TITLE_KEYS[type])} description={t("legal.policies.updated")}>
      <Body />
    </LegalScreen>
  );
}
