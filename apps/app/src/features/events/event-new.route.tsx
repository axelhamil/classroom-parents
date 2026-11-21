import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useSchoolClock } from "../../shared/agenda/school-clock-context";
import { childrenQueryOptions } from "../../shared/api/queries/children";
import { redirectToOnboardingWithoutChild } from "../../shared/children/redirect-to-onboarding";
import { Screen } from "../../shared/layout/screen";
import { QueryState } from "../../shared/query/query-state";
import { newEventSearchSchema } from "./events.schema";
import { AddEventForm } from "./forms/add-event-form";
import { sharedDraft } from "./shared-draft";

export const Route = createFileRoute("/_protected/_shell/events/new")({
  validateSearch: newEventSearchSchema,
  beforeLoad: redirectToOnboardingWithoutChild,
  component: NewEventPage,
});

function NewEventPage() {
  const { t } = useTranslation("events");
  const children = useQuery(childrenQueryOptions);
  const navigate = useNavigate();
  const draft = sharedDraft(Route.useSearch());
  const { today } = useSchoolClock();

  return (
    <Screen
      title={t("calendar.addDialog.title")}
      description={t("calendar.addDialog.description")}
      width="full"
    >
      <QueryState
        query={children}
        skeleton={
          <SkeletonGroup label={t("calendar.loading")} className="gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </SkeletonGroup>
        }
      >
        {(family) => (
          <AddEventForm
            family={family}
            childId={family[0]?.id ?? ""}
            date={today}
            draft={draft}
            onAdded={() => void navigate({ to: "/", viewTransition: true })}
          />
        )}
      </QueryState>
    </Screen>
  );
}
