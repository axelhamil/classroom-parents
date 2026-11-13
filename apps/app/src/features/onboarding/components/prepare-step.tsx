import { Button } from "@packages/ui/components/ui/button";
import { Backpack, KeyRound, School, ShieldQuestion } from "lucide-react";
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
      media={<Backpack />}
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
            icon: School,
            title: t("prepare.schoolAccount"),
            detail: t("prepare.schoolAccountDetail"),
            hint: t("prepare.schoolAccountHint"),
          },
          {
            id: "password",
            icon: KeyRound,
            title: t("prepare.password"),
            detail: t("prepare.passwordDetail"),
          },
          {
            id: "school",
            icon: ShieldQuestion,
            title: t("prepare.school"),
            detail: t("prepare.schoolDetail"),
          },
        ]}
      />
    </StepFrame>
  );
}
