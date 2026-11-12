import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import type { ChildHue } from "../../../shared/format/child-hue";
import { ChildNameForm } from "../forms/child-name-form";
import { StepFrame } from "./step-frame";

export interface NameStepProps {
  child: ChildDto;
  hue: ChildHue;
  avatarUrl?: string | null;
  onNext: () => void;
}

export function NameStep({ child, hue, avatarUrl, onNext }: NameStepProps) {
  const { t } = useTranslation("onboarding");

  return (
    <StepFrame
      media={<ChildAvatar name={child.label} tone={hue} src={avatarUrl} size="lg" />}
      mediaTone="bare"
      title={t("name.title")}
      description={t("name.description")}
    >
      <ChildNameForm child={child} onDone={onNext} />
    </StepFrame>
  );
}
