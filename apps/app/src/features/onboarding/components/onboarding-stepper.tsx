import { Button } from "@packages/ui/components/ui/button";
import { Progress } from "@packages/ui/components/ui/progress";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import {
  Stepper,
  StepperHeader,
  StepperPanel,
  StepperPosition,
} from "@packages/ui/components/ui/stepper";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { type ChildDto, childrenQueryOptions } from "../../../shared/api/queries/children";
import { childHue } from "../../../shared/format/child-hue";
import { QueryState } from "../../../shared/query/query-state";
import {
  type OnboardingMode,
  type OnboardingSearch,
  type OnboardingStep,
  resolveOnboardingStep,
  stepPosition,
} from "../onboarding-steps";
import { AnalysisStep } from "./analysis-step";
import { ConnectStep } from "./connect-step";
import { DoneStep } from "./done-step";
import { NameStep } from "./name-step";
import { NotificationsStep } from "./notifications-step";
import { PrepareStep } from "./prepare-step";
import { RemindersStep } from "./reminders-step";
import { WelcomeStep } from "./welcome-step";

export type OnboardingNavigate = (search: OnboardingSearch, replace?: boolean) => void;

export interface OnboardingStepperProps {
  mode: OnboardingMode;
  userId: string;
  search: OnboardingSearch;
  navigate: OnboardingNavigate;
}

export function OnboardingStepper(props: OnboardingStepperProps) {
  const { t } = useTranslation("onboarding");
  const children = useQuery(childrenQueryOptions);

  return (
    <Stepper asChild>
      <main>
        <QueryState
          query={children}
          skeleton={
            <SkeletonGroup label={t("stepper.progress")} className="gap-6">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-64 w-full" />
            </SkeletonGroup>
          }
        >
          {(family) => <ResolvedStepper {...props} family={family} />}
        </QueryState>
      </main>
    </Stepper>
  );
}

interface ResolvedStepperProps extends OnboardingStepperProps {
  family: ChildDto[];
}

function ResolvedStepper({ mode, userId, search, navigate, family }: ResolvedStepperProps) {
  const { t } = useTranslation("onboarding");
  const { step, child } = resolveOnboardingStep(mode, search, family);
  const position = stepPosition(mode, step);
  const panel = useRef<HTMLElement>(null);
  const shownIndex = useRef(position.current);
  const direction = position.current < shownIndex.current ? "back" : "forward";

  useEffect(() => {
    if (shownIndex.current === position.current) return;
    shownIndex.current = position.current;
    panel.current?.querySelector("h1")?.focus();
  }, [position.current]);

  const go = (next: OnboardingStep) => navigate({ child: child?.id, step: next });
  const back = position.previous;

  return (
    <>
      <StepperHeader>
        {back && (
          <Button variant="ghost" size="sm" onClick={() => go(back)}>
            <ChevronLeft aria-hidden />
            {t("stepper.back")}
          </Button>
        )}
        <StepperPosition>
          {t("stepper.position", { current: position.current, total: position.total })}
        </StepperPosition>
        <Progress
          aria-label={t("stepper.progress")}
          value={(position.current / position.total) * 100}
          className="ml-auto max-w-32 flex-1"
        />
      </StepperHeader>

      <StepperPanel key={step} ref={panel} direction={direction}>
        <CurrentStep
          step={step}
          child={child}
          hue={child ? childHue(family, child.id) : 1}
          mode={mode}
          userId={userId}
          search={search}
          navigate={navigate}
          go={go}
        />
      </StepperPanel>
    </>
  );
}

interface CurrentStepProps {
  step: OnboardingStep;
  child: ChildDto | undefined;
  hue: ReturnType<typeof childHue>;
  mode: OnboardingMode;
  userId: string;
  search: OnboardingSearch;
  navigate: OnboardingNavigate;
  go: (step: OnboardingStep) => void;
}

function CurrentStep({ step, child, hue, mode, userId, search, navigate, go }: CurrentStepProps) {
  if (step === "welcome") return <WelcomeStep onNext={() => go("prepare")} />;
  if (step === "prepare") return <PrepareStep onNext={() => go("connect")} />;
  if (!child) return <ConnectStep mode={mode} search={search} navigate={navigate} />;
  if (step === "name") return <NameStep child={child} hue={hue} onNext={() => go("analysis")} />;
  if (step === "analysis") {
    return <AnalysisStep mode={mode} child={child} hue={hue} onNext={() => go("reminders")} />;
  }
  if (step === "reminders") {
    return <RemindersStep child={child} userId={userId} onNext={() => go("notifications")} />;
  }
  if (step === "notifications") {
    return <NotificationsStep userId={userId} onNext={() => go("done")} />;
  }

  return <DoneStep child={child} hue={hue} userId={userId} />;
}
