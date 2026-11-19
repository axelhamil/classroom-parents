import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import type { ChildHue } from "../../../shared/format/child-hue";
import { ChildNameForm } from "../forms/child-name-form";
import { StepFrame } from "./step-frame";

export interface NameStepProps {
  child: ChildDto;
  hue: ChildHue;
  onNext: () => void;
}

export function NameStep({ child, hue, onNext }: NameStepProps) {
  const { t } = useTranslation("onboarding");

  return (
    <StepFrame title={t("name.title")} description={t("name.description")}>
      <ChildNameForm child={child} hue={hue} onDone={onNext} />
    </StepFrame>
  );
}
