import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { toastSuccess } from "@packages/web-kit/api/errors/toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../shared/layout/screen";
import { QueryState } from "../../shared/query/query-state";
import { eventQueryOptions } from "./api/events.queries";
import { EventNotFound, isEventGone } from "./components/event-not-found";
import { EventEditForm } from "./forms/event-edit-form";

export const Route = createFileRoute("/_protected/_shell/events/$eventId/edit")({
  component: EventEditPage,
});

function EventEditPage() {
  const { t } = useTranslation("eventEdit");
  const { eventId } = Route.useParams();
  const query = useQuery(eventQueryOptions(eventId));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toDetail = () =>
    void navigate({ to: "/events/$eventId", params: { eventId }, viewTransition: true });

  if (isEventGone(query)) return <EventNotFound />;

  return (
    <Screen title={t("title")}>
      <QueryState
        query={query}
        staleMessage={t("refreshError")}
        skeleton={
          <SkeletonGroup label={t("loading")} className="gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </SkeletonGroup>
        }
      >
        {(event) => (
          <EventEditForm
            event={event}
            onSaved={(saved) => {
              queryClient.setQueryData(eventQueryOptions(eventId).queryKey, saved);
              void queryClient.invalidateQueries({ queryKey: ["events"], refetchType: "none" });
              toastSuccess(t("saved"));
              toDetail();
            }}
            onCancel={toDetail}
            onDeleted={() => void navigate({ to: "/" })}
          />
        )}
      </QueryState>
    </Screen>
  );
}
