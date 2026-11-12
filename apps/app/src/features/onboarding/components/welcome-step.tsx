import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { Hint } from "@packages/ui/components/ui/hint";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { BellRing, BookOpenCheck, CalendarHeart, EyeOff, UserRoundCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StepFrame } from "./step-frame";
import { StepList } from "./step-list";

export interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  const { t } = useTranslation("onboarding");

  return (
    <StepFrame
      media={<CalendarHeart />}
      title={t("welcome.title")}
      description={t("welcome.description")}
      actions={
        <Button size="lg" onClick={onNext}>
          {t("welcome.start")}
        </Button>
      }
    >
      <section aria-labelledby="welcome-plan" className="flex flex-col gap-2">
        <TypographyH2 id="welcome-plan" variant="section">
          {t("welcome.planTitle")}
        </TypographyH2>
        <StepList
          entries={[
            { id: "account", icon: UserRoundCheck, title: t("welcome.plan.account") },
            { id: "read", icon: BookOpenCheck, title: t("welcome.plan.read") },
            { id: "alert", icon: BellRing, title: t("welcome.plan.alert") },
          ]}
        />
      </section>

      <div className="flex flex-col items-start gap-2">
        <Hint text={t("welcome.readOnlyHint")}>
          <Badge variant="soon">{t("welcome.readOnly")}</Badge>
        </Hint>
        <TypographyMuted className="flex items-start gap-2">
          <EyeOff aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("welcome.never")}
        </TypographyMuted>
      </div>
    </StepFrame>
  );
}
