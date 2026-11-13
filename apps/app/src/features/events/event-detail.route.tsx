import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../shared/layout/screen";
import { QueryState } from "../../shared/query/query-state";
import { eventQueryOptions } from "./api/events.queries";
import { EventDetailBody, EventDetailSkeleton } from "./components/event-detail-body";
import { EventNotFound, isEventGone } from "./components/event-not-found";
import { useCelebrateProgress } from "./hooks/use-celebrate-progress";
import { useNow } from "./hooks/use-now";

export const Route = createFileRoute("/_protected/_shell/events/$eventId")({
  component: EventDetailPage,
});

function EventDetailPage() {
  const { t } = useTranslation("events");
  const { eventId } = Route.useParams();
  const navigate = useNavigate();
  const query = useQuery(eventQueryOptions(eventId));
  useCelebrateProgress(useNow());

  if (isEventGone(query)) return <EventNotFound />;

  return (
    <Screen title={query.data?.title ?? t("detail.title")}>
      <QueryState query={query} skeleton={<EventDetailSkeleton />}>
        {(event) => <EventDetailBody event={event} onDeleted={() => void navigate({ to: "/" })} />}
      </QueryState>
    </Screen>
  );
}
