import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { childrenQueryOptions } from "../../shared/api/queries/children";
import { redirectToOnboardingWithoutChild } from "../../shared/children/redirect-to-onboarding";
import { schoolToday } from "../../shared/format/school-today";
import { Screen } from "../../shared/layout/screen";
import { QueryState } from "../../shared/query/query-state";
import { AddEventForm } from "./forms/add-event-form";

export const Route = createFileRoute("/_protected/_shell/events/new")({
  beforeLoad: redirectToOnboardingWithoutChild,
  component: NewEventPage,
});

function NewEventPage() {
  const { t } = useTranslation("events");
  const children = useQuery(childrenQueryOptions);
  const navigate = useNavigate();

  return (
    <Screen title={t("calendar.addDialog.title")} description={t("calendar.addDialog.description")}>
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
            date={schoolToday(new Date())}
            onAdded={() => void navigate({ to: "/", viewTransition: true })}
          />
        )}
      </QueryState>
    </Screen>
  );
}
