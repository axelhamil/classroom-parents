import { Button } from "@packages/ui/components/ui/button";
import {
  AnalysisFailedIcon,
  AnalyzingIcon,
  CelebrateIcon,
  CredentialsIcon,
  RetryIcon,
  StepDoneIcon,
  StepPendingIcon,
  WarningIcon,
} from "@packages/ui/components/ui/icons";
import { Progress } from "@packages/ui/components/ui/progress";
import { Spinner } from "@packages/ui/components/ui/spinner";
import { RevealList } from "@packages/ui/components/ui/stepper";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { useIsMutating, useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import { syncChildMutationOptions } from "../../../shared/children/child-link.mutations";
import { firstEventsQueryOptions } from "../../../shared/children/child-link.queries";
import { classifySchoolError } from "../../../shared/children/school-error";
import { SchoolProcedure } from "../../../shared/children/school-procedure";
import { useStartChildLink } from "../../../shared/children/use-start-child-link";
import { EventCard } from "../../../shared/events/event-card";
import type { ChildHue, DeadlineSurface } from "../../../shared/format/child-hue";
import { analysisState, type OnboardingMode } from "../onboarding-steps";
import { StepFrame } from "./step-frame";
import { StepList } from "./step-list";

export interface AnalysisStepProps {
  mode: OnboardingMode;
  child: ChildDto;
  hue: ChildHue;
  surface: DeadlineSurface;
  onNext: () => void;
}

interface WayOutProps {
  primary?: ReactNode;
}

function WayOut({ primary }: WayOutProps) {
  const { t } = useTranslation("onboarding");

  return (
    <>
      {primary}
      <Button asChild size="lg" variant={primary ? "outline" : "default"}>
        <Link to="/children/new">{t("analysis.addAnother")}</Link>
      </Button>
      <Button asChild size="lg" variant="ghost">
        <Link to="/children">{t("connect.later")}</Link>
      </Button>
    </>
  );
}

export function AnalysisStep({ mode, child, hue, surface, onNext }: AnalysisStepProps) {
  const { t } = useTranslation("onboarding");
  const syncRequested = useIsMutating({ mutationKey: syncChildMutationOptions.mutationKey }) > 0;
  const state = analysisState(child, syncRequested);
  const firstEvents = useQuery(firstEventsQueryOptions(child.id, state === "ready"));
  const reconnect = useStartChildLink();
  const sync = useMutation({
    ...syncChildMutationOptions,
    onError: (error) => toastError(error, t("analysis.failedTitle")),
  });
  const actions =
    mode === "first" ? (
      state === "ready" && (
        <Button size="lg" onClick={onNext}>
          {t("analysis.next")}
        </Button>
      )
    ) : (
      <>
        <Button asChild size="lg">
          <Link to="/">{t("analysis.toEvents")}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/children/new">{t("analysis.addAnother")}</Link>
        </Button>
      </>
    );

  if (state === "blocked") {
    return (
      <StepFrame
        media={<WarningIcon />}
        mediaTone="warning"
        title={t("analysis.title")}
        description={t("analysis.blocked", { label: child.label })}
        actions={<WayOut />}
      >
        <SchoolProcedure kind={classifySchoolError(child)} />
      </StepFrame>
    );
  }

  if (state === "reconnect") {
    const label = reconnect.isPending ? t("analysis.reconnecting") : t("analysis.reconnect");

    return (
      <StepFrame
        media={<CredentialsIcon />}
        mediaTone="warning"
        title={t("analysis.reconnectTitle")}
        description={t("analysis.reconnectDescription", { label: child.label })}
        actions={
          <WayOut
            primary={
              <Button
                size="lg"
                disabled={reconnect.isPending}
                onClick={() => reconnect.mutate({ reconnectChildId: child.id })}
              >
                {reconnect.isPending && <Spinner aria-hidden label={label} />}
                {label}
              </Button>
            }
          />
        }
      />
    );
  }

  if (state === "failed") {
    return (
      <StepFrame
        media={<AnalysisFailedIcon />}
        mediaTone="warning"
        title={t("analysis.failedTitle")}
        description={t("analysis.failedDescription", { label: child.label })}
        actions={
          <WayOut
            primary={
              <Button size="lg" disabled={sync.isPending} onClick={() => sync.mutate(child.id)}>
                <RetryIcon aria-hidden />
                {t("analysis.retry")}
              </Button>
            }
          />
        }
      />
    );
  }

  if (state === "reading") {
    return (
      <StepFrame
        media={<AnalyzingIcon />}
        title={t("analysis.title")}
        description={t("analysis.running", { label: child.label })}
        actions={actions}
      >
        <Progress indeterminate aria-label={t("analysis.phases.courses")} />
        <StepList
          entries={[
            { id: "linked", icon: StepDoneIcon, title: t("analysis.phases.linked") },
            {
              id: "courses",
              icon: StepPendingIcon,
              busy: true,
              title: t("analysis.phases.courses"),
            },
            { id: "deadlines", icon: StepPendingIcon, title: t("analysis.phases.deadlines") },
          ]}
        />
      </StepFrame>
    );
  }

  const events = firstEvents.data ?? [];

  return (
    <StepFrame
      media={<CelebrateIcon />}
      mediaTone="success"
      title={t("analysis.title")}
      description={
        <span aria-live="polite">
          {events.length > 0
            ? t("analysis.found", { label: child.label })
            : firstEvents.isSuccess && t("analysis.noEvent")}
        </span>
      }
      actions={actions}
    >
      {firstEvents.isPending && <TypographyMuted>{t("analysis.phases.deadlines")}</TypographyMuted>}
      {events.length > 0 && (
        <RevealList>
          {events.map((event) => (
            <li key={event.id}>
              <EventCard event={event} childLabel={child.label} hue={hue} surface={surface} />
            </li>
          ))}
        </RevealList>
      )}
    </StepFrame>
  );
}
