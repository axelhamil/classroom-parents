import { Button } from "@packages/ui/components/ui/button";
import {
  ChildIcon,
  CredentialsIcon,
  SchoolAccountIcon,
  SchoolPolicyIcon,
} from "@packages/ui/components/ui/icons";
import { useTranslation } from "react-i18next";
import { StepFrame } from "./step-frame";
import { StepList } from "./step-list";

export interface PrepareStepProps {
  onNext: () => void;
}

export function PrepareStep({ onNext }: PrepareStepProps) {
  const { t } = useTranslation("onboarding");

  return (
    <StepFrame
      media={<ChildIcon />}
      title={t("prepare.title")}
      description={t("prepare.description")}
      actions={
        <Button size="lg" onClick={onNext}>
          {t("prepare.next")}
        </Button>
      }
    >
      <StepList
        entries={[
          {
            id: "account",
            icon: SchoolAccountIcon,
            title: t("prepare.schoolAccount"),
            detail: t("prepare.schoolAccountDetail"),
            hint: t("prepare.schoolAccountHint"),
          },
          {
            id: "password",
            icon: CredentialsIcon,
            title: t("prepare.password"),
            detail: t("prepare.passwordDetail"),
          },
          {
            id: "school",
            icon: SchoolPolicyIcon,
            title: t("prepare.school"),
            detail: t("prepare.schoolDetail"),
          },
        ]}
      />
    </StepFrame>
  );
}
