import { Button } from "@packages/ui/components/ui/button";
import { Progress } from "@packages/ui/components/ui/progress";
import { RevealList } from "@packages/ui/components/ui/stepper";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleCheck, CircleDashed, ScanSearch, Sparkles, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import { firstEventsQueryOptions } from "../../../shared/children/child-link.queries";
import { classifySchoolError } from "../../../shared/children/school-error";
import { SchoolProcedure } from "../../../shared/children/school-procedure";
import { EventCard } from "../../../shared/events/event-card";
import type { ChildHue } from "../../../shared/format/child-hue";
import { isFirstSyncDone, type OnboardingMode } from "../onboarding-steps";
import { StepFrame } from "./step-frame";
import { StepList } from "./step-list";

export interface AnalysisStepProps {
  mode: OnboardingMode;
  child: ChildDto;
  hue: ChildHue;
  onNext: () => void;
}

export function AnalysisStep({ mode, child, hue, onNext }: AnalysisStepProps) {
  const { t } = useTranslation("onboarding");
  const ready = isFirstSyncDone(child);
  const blocked = child.status === "blocked_by_school";
  const firstEvents = useQuery(firstEventsQueryOptions(child.id, ready));
  const actions =
    mode === "first" ? (
      ready && (
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

  if (blocked) {
    return (
      <StepFrame
        media={<TriangleAlert />}
        mediaTone="warning"
        title={t("analysis.title")}
        description={t("analysis.blocked", { label: child.label })}
        actions={
          <Button asChild size="lg" variant="outline">
            <Link to="/children">{t("connect.later")}</Link>
          </Button>
        }
      >
        <SchoolProcedure kind={classifySchoolError(child)} />
      </StepFrame>
    );
  }

  if (!ready) {
    return (
      <StepFrame
        media={<ScanSearch />}
        title={t("analysis.title")}
        description={t("analysis.running", { label: child.label })}
        actions={actions}
      >
        <Progress indeterminate aria-label={t("analysis.phases.courses")} />
        <StepList
          entries={[
            { id: "linked", icon: CircleCheck, title: t("analysis.phases.linked") },
            { id: "courses", icon: CircleDashed, busy: true, title: t("analysis.phases.courses") },
            { id: "deadlines", icon: CircleDashed, title: t("analysis.phases.deadlines") },
          ]}
        />
      </StepFrame>
    );
  }

  const events = firstEvents.data ?? [];

  return (
    <StepFrame
      media={<Sparkles />}
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
              <EventCard event={event} childLabel={child.label} hue={hue} />
            </li>
          ))}
        </RevealList>
      )}
    </StepFrame>
  );
}
