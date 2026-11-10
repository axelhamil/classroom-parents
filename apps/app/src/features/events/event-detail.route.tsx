import { Button } from "@packages/ui/components/ui/button";
import {
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
} from "@packages/ui/components/ui/description-list";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { Separator } from "@packages/ui/components/ui/separator";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { TypographyH2, TypographyP } from "@packages/ui/components/ui/typography";
import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { childrenQueryOptions } from "../../shared/api/queries/children";
import { deadlineLabel } from "../../shared/format/deadline-label";
import { schoolToday } from "../../shared/format/school-today";
import { Screen } from "../../shared/layout/screen";
import { type EventItem, eventQueryOptions } from "./api/events.queries";
import { AlertSetting } from "./components/alert-setting";
import { DeleteEventDialog } from "./components/delete-event-dialog";
import { EventBadges } from "./components/event-badges";

export const Route = createFileRoute("/_protected/_shell/events/$eventId")({
  component: EventDetailPage,
});

function EventDetailPage() {
  const { t } = useTranslation("events");
  const { eventId } = Route.useParams();
  const query = useQuery(eventQueryOptions(eventId));

  if (query.isPending) {
    return (
      <Screen title={t("detail.title")}>
        <SkeletonGroup label={t("detail.loading")} className="gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24 w-full" />
        </SkeletonGroup>
      </Screen>
    );
  }

  if (query.isError) {
    const notFound = apiErrorFields(query.error).status === 404;

    return (
      <Screen
        title={notFound ? t("detail.notFound.title") : t("detail.title")}
        description={notFound ? t("detail.notFound.description") : undefined}
      >
        {!notFound && <LoadErrorAlert message={t("list.loadError")} />}
        <Button asChild variant="outline" className="self-start">
          <Link to="/">{t("detail.back")}</Link>
        </Button>
      </Screen>
    );
  }

  return <EventSheet event={query.data} />;
}

interface EventSheetProps {
  event: EventItem;
}

function EventSheet({ event }: EventSheetProps) {
  const { t } = useTranslation("events");
  const navigate = useNavigate();
  const children = useQuery(childrenQueryOptions);
  const now = new Date();
  const childLabel = children.data?.find((child) => child.id === event.childId)?.label;

  return (
    <Screen title={event.title}>
      <EventBadges event={event} />
      <DescriptionList layout="inline">
        <DescriptionItem>
          <DescriptionTerm>{t("detail.deadline")}</DescriptionTerm>
          <DescriptionDetails>
            {deadlineLabel(event.deadlineDate, event.deadlineTime, now)}
          </DescriptionDetails>
        </DescriptionItem>
        <DescriptionItem>
          <DescriptionTerm>{t("detail.received")}</DescriptionTerm>
          <DescriptionDetails>
            {deadlineLabel(schoolToday(new Date(event.receivedAt)), undefined, now)}
          </DescriptionDetails>
        </DescriptionItem>
        {childLabel && (
          <DescriptionItem>
            <DescriptionTerm>{t("detail.child")}</DescriptionTerm>
            <DescriptionDetails>{childLabel}</DescriptionDetails>
          </DescriptionItem>
        )}
      </DescriptionList>
      {event.description && (
        <section aria-labelledby="event-description-title" className="flex flex-col gap-2">
          <TypographyH2 id="event-description-title" variant="section">
            {t("detail.description")}
          </TypographyH2>
          <TypographyP className="wrap-anywhere whitespace-pre-line">
            {event.description}
          </TypographyP>
        </section>
      )}
      <Button asChild variant="outline" className="self-start">
        <a href={event.announcementUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink aria-hidden />
          {t("detail.openInClassroom")}
        </a>
      </Button>
      <Separator />
      <AlertSetting eventId={event.id} deadlineDate={event.deadlineDate} />
      <Separator />
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to="/events/$eventId/edit" params={{ eventId: event.id }}>
            <Pencil aria-hidden />
            {t("detail.edit")}
          </Link>
        </Button>
        <DeleteEventDialog
          eventId={event.id}
          eventTitle={event.title}
          onDeleted={() => void navigate({ to: "/" })}
        />
      </div>
    </Screen>
  );
}
