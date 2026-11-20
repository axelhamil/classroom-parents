import { Button } from "@packages/ui/components/ui/button";
import {
  PickAccountIcon,
  PrivacyIcon,
  RetryIcon,
  UseAnotherAccountIcon,
} from "@packages/ui/components/ui/icons";
import { Spinner } from "@packages/ui/components/ui/spinner";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  ADD_CHILD,
  ADD_FIRST_CHILD,
  type ChildLinkRoundTrip,
} from "../../../shared/children/child-link.mutations";
import { LinkRefusal, refusalIsSchoolBlock } from "../../../shared/children/link-refusal";
import { useStartChildLink } from "../../../shared/children/use-start-child-link";
import { linkWasRefused, type OnboardingMode, type OnboardingSearch } from "../onboarding-steps";
import { LinkedAccount } from "./linked-account";
import type { OnboardingNavigate } from "./onboarding-stepper";
import { StepFrame } from "./step-frame";
import { StepList } from "./step-list";

const ROUND_TRIPS: Record<OnboardingMode, ChildLinkRoundTrip> = {
  first: ADD_FIRST_CHILD,
  another: ADD_CHILD,
};

export interface ConnectStepProps {
  mode: OnboardingMode;
  search: OnboardingSearch;
  navigate: OnboardingNavigate;
}

export function ConnectStep({ mode, search, navigate }: ConnectStepProps) {
  const { t } = useTranslation("onboarding");
  const start = useStartChildLink();
  const roundTrip = ROUND_TRIPS[mode];
  const startLabel = start.isPending ? t("connect.starting") : t("connect.start");

  if (linkWasRefused(search)) {
    return (
      <StepFrame
        media={<PrivacyIcon />}
        mediaTone="warning"
        title={
          refusalIsSchoolBlock(search.error, search.error_description)
            ? t("connect.blockedTitle")
            : t("connect.refusedTitle")
        }
        actions={
          <>
            <Button size="lg" disabled={start.isPending} onClick={() => start.mutate(roundTrip)}>
              <RetryIcon aria-hidden />
              {t("connect.tryAgain")}
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/children">{t("connect.later")}</Link>
            </Button>
          </>
        }
      >
        <LinkRefusal error={search.error} errorDescription={search.error_description} />
      </StepFrame>
    );
  }

  if (search.linked === 1) {
    return (
      <StepFrame media={<PickAccountIcon />} title={t("connect.title")}>
        <LinkedAccount
          onRetry={() => start.mutate(roundTrip)}
          retrying={start.isPending}
          onRegistered={(childId) => navigate({ child: childId, step: "name" }, true)}
        />
      </StepFrame>
    );
  }

  return (
    <StepFrame
      media={<PickAccountIcon />}
      title={t("connect.title")}
      description={t("connect.description")}
      actions={
        <Button size="lg" disabled={start.isPending} onClick={() => start.mutate(roundTrip)}>
          {start.isPending && <Spinner aria-hidden label={startLabel} />}
          {startLabel}
        </Button>
      }
    >
      <StepList
        entries={[
          { id: "other", icon: UseAnotherAccountIcon, title: t("connect.tips.other") },
          { id: "consent", icon: PrivacyIcon, title: t("connect.tips.consent") },
        ]}
      />
    </StepFrame>
  );
}
