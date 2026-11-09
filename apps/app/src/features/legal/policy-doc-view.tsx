import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { Separator } from "@packages/ui/components/ui/separator";
import { cn } from "@packages/ui/libs/utils.js";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { POLICY_TITLE_KEYS, type PolicyType } from "../../shared/legal/policy-labels";
import { UntranslatedBodyBanner } from "./components/untranslated-body-banner";
import { PrivacyPolicyBody, TermsBody } from "./policies/en";

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
    <main className={cn(pageContainerVariants({ width: "prose" }), "flex flex-col gap-8 py-8")}>
      <PageHeader title={t(POLICY_TITLE_KEYS[type])} />

      <Separator />

      <UntranslatedBodyBanner />

      <Body />
    </main>
  );
}
