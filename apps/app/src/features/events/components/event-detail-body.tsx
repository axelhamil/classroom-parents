import { Button } from "@packages/ui/components/ui/button";
import {
  DeadlineActions,
  DeadlineFooter,
  DeadlineQuote,
} from "@packages/ui/components/ui/deadline-sheet";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { TypographyH2 } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarPlusIcon, CheckCheckIcon, CheckIcon, ExternalLink, Pencil } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Route as ProtectedRoute } from "../../../router/_protected";
import { type ChildDto, childrenQueryOptions } from "../../../shared/api/queries/children";
import type { EventItem } from "../../../shared/api/queries/events";
import { deadlineTitle } from "../../../shared/events/deadline-title";
import { childHue } from "../../../shared/format/child-hue";
import { deadlineLabel, inSentence } from "../../../shared/format/deadline-label";
import { ScreenTour } from "../../../shared/tour/screen-tour";
import { useAgendaDownload } from "../hooks/use-agenda-download";
import { useConfirmEvent } from "../hooks/use-confirm-event";
import { useToggleDone } from "../hooks/use-toggle-done";
import { DeleteEventDialog } from "./delete-event-dialog";
import { EventReminders } from "./event-reminders";
import { EventWhen } from "./event-when";
import { PrepareChecklist } from "./prepare-checklist";
import { ReviewReasons } from "./review-reasons";
import { ShareButton } from "./share-button";

export function EventDetailSkeleton() {
  const { t } = useTranslation("events");

  return (
    <SkeletonGroup label={t("detail.loading")} className="gap-3">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-16 w-full" />
    </SkeletonGroup>
  );
}

export interface EventDetailBodyProps {
  event: EventItem;
  onDeleted: () => void;
}

export function EventDetailBody({ event, onDeleted }: EventDetailBodyProps) {
  const { t } = useTranslation("events");
  const { user } = ProtectedRoute.useRouteContext();
  const family = useQuery(childrenQueryOptions).data ?? [];
  const child = family.find((candidate) => candidate.id === event.childId);

  return (
    <>
      <EventWhen event={event} hue={child ? childHue(family, child.id) : 1} now={new Date()} />
      {event.status === "needs_review" && <EventReview event={event} />}
      <EventActions event={event} child={child} />
      {event.description && <EventDescription description={event.description} />}
      <PrepareChecklist event={event} />
      {!event.done && (
        <EventReminders
          eventId={event.id}
          timed={event.deadlineTime !== undefined}
          needsReview={event.status === "needs_review"}
        />
      )}
      <DeadlineFooter>
        <Button asChild variant="ghost" size="sm">
          <Link to="/events/$eventId/edit" params={{ eventId: event.id }} viewTransition>
            <Pencil aria-hidden />
            {t("detail.edit")}
          </Link>
        </Button>
        <DeleteEventDialog eventId={event.id} eventTitle={event.title} onDeleted={onDeleted} />
      </DeadlineFooter>
      <ScreenTour screen="event-detail" userId={user.id} />
    </>
  );
}

interface EventActionsProps {
  event: EventItem;
  child: ChildDto | undefined;
}

function EventActions({ event, child }: EventActionsProps) {
  const { t } = useTranslation("events");
  const toggle = useToggleDone();
  const now = new Date();

  const addToAgenda = useAgendaDownload(event, child);

  const sharePayload = () => {
    const title = deadlineTitle(t, event.title, child?.label);
    const when = inSentence(deadlineLabel(event.deadlineDate, event.deadlineTime, now));

    return {
      title,
      text: `${title}\n${t("share.when", { when })}`,
      url: `${window.location.origin}/events/${event.id}`,
    };
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        size="lg"
        variant={event.done ? "secondary" : "default"}
        aria-pressed={event.done}
        className="w-full"
        onClick={() => toggle.mutate({ eventId: event.id, done: !event.done })}
      >
        <CheckIcon aria-hidden />
        {t("detail.done")}
      </Button>
      <DeadlineActions>
        <Button
          type="button"
          variant="outline"
          size="tile"
          aria-label={t("agenda.add")}
          data-tour="event-detail-agenda"
          onClick={addToAgenda}
        >
          <CalendarPlusIcon aria-hidden />
          {t("agenda.addShort")}
        </Button>
        <ShareButton label={t("share.action")} payload={sharePayload} />
        {event.announcementUrl && (
          <Button asChild variant="outline" size="tile">
            <a
              href={event.announcementUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("detail.openInClassroom")}
            >
              <ExternalLink aria-hidden />
              {t("detail.openInClassroomShort")}
            </a>
          </Button>
        )}
      </DeadlineActions>
    </div>
  );
}

interface EventDescriptionProps {
  description: string;
}

function EventDescription({ description }: EventDescriptionProps) {
  const { t } = useTranslation("events");
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <TypographyH2 id={titleId} variant="section">
        {t("detail.description")}
      </TypographyH2>
      <DeadlineQuote>{description}</DeadlineQuote>
    </section>
  );
}

interface EventReviewProps {
  event: EventItem;
}

function EventReview({ event }: EventReviewProps) {
  const { t } = useTranslation("events");
  const titleId = useId();
  const confirm = useConfirmEvent();

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <TypographyH2 id={titleId} variant="section">
        {t("review.why")}
      </TypographyH2>
      <ReviewReasons event={event} />
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={confirm.isPending}
        onClick={() => confirm.mutate(event.id)}
      >
        <CheckCheckIcon aria-hidden />
        {t("review.confirm")}
      </Button>
    </section>
  );
}
