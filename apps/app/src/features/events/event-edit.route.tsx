import { Button } from "@packages/ui/components/ui/button";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import { toastSuccess } from "@packages/web-kit/api/errors/toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../shared/layout/screen";
import { eventQueryOptions } from "./api/events.queries";
import { EventEditForm } from "./forms/event-edit-form";

export const Route = createFileRoute("/_protected/_shell/events/$eventId/edit")({
  component: EventEditPage,
});

function EventEditPage() {
  const { t } = useTranslation("eventEdit");
  const { t: tEvents } = useTranslation("events");
  const { eventId } = Route.useParams();
  const query = useQuery(eventQueryOptions(eventId));
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  if (query.isPending) {
    return (
      <Screen title={t("title")}>
        <SkeletonGroup label={t("loading")} className="gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </SkeletonGroup>
      </Screen>
    );
  }

  if (query.isError) {
    const notFound = apiErrorFields(query.error).status === 404;

    return (
      <Screen
        title={notFound ? tEvents("detail.notFound.title") : t("title")}
        description={notFound ? tEvents("detail.notFound.description") : undefined}
      >
        {!notFound && <LoadErrorAlert message={tEvents("list.loadError")} />}
        <Button asChild variant="outline" className="self-start">
          <Link to="/">{tEvents("detail.back")}</Link>
        </Button>
      </Screen>
    );
  }

  return (
    <Screen title={t("title")}>
      <EventEditForm
        event={query.data}
        onSaved={(saved) => {
          queryClient.setQueryData(eventQueryOptions(eventId).queryKey, saved);
          void queryClient.invalidateQueries({ queryKey: ["events"], refetchType: "none" });
          toastSuccess(t("saved"));
          void navigate({ to: "/events/$eventId", params: { eventId } });
        }}
        onCancel={() => void navigate({ to: "/events/$eventId", params: { eventId } })}
        onDeleted={() => void navigate({ to: "/" })}
      />
    </Screen>
  );
}
