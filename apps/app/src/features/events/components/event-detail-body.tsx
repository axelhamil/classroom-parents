import { Button } from "@packages/ui/components/ui/button";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import {
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
} from "@packages/ui/components/ui/description-list";
import { Separator } from "@packages/ui/components/ui/separator";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { TypographyH2, TypographyP } from "@packages/ui/components/ui/typography";
import { toastSuccess } from "@packages/web-kit/api/errors/toast";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarPlusIcon, ExternalLink, Pencil } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { childrenQueryOptions } from "../../../shared/api/queries/children";
import type { EventItem } from "../../../shared/api/queries/events";
import { deadlineIcs, downloadIcs, icsFileName } from "../../../shared/calendar/ics";
import { EventBadges } from "../../../shared/events/event-badges";
import { DeadlineWhen } from "../../../shared/events/event-card";
import { childHue } from "../../../shared/format/child-hue";
import { countdownOf, deadlineLabel } from "../../../shared/format/deadline-label";
import { schoolToday } from "../../../shared/format/school-today";
import { DeleteEventDialog } from "./delete-event-dialog";
import { EventReminders } from "./event-reminders";
import { PrepareChecklist } from "./prepare-checklist";
import { ShareButton } from "./share-button";

const LOCALE = "fr-FR";

export function EventDetailSkeleton() {
  const { t } = useTranslation("events");

  return (
    <SkeletonGroup label={t("detail.loading")} className="gap-3">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-24 w-full" />
    </SkeletonGroup>
  );
}

export interface EventDetailBodyProps {
  event: EventItem;
  onDeleted: () => void;
}

export function EventDetailBody({ event, onDeleted }: EventDetailBodyProps) {
  const { t } = useTranslation("events");
  const descriptionId = useId();
  const children = useQuery(childrenQueryOptions);
  const now = new Date();
  const family = children.data ?? [];
  const child = family.find((candidate) => candidate.id === event.childId);
  const label = deadlineLabel(event.deadlineDate, event.deadlineTime, now);
  const countdown = event.done ? null : countdownOf(event.deadlineDate, event.deadlineTime, now);

  const addToAgenda = () => {
    downloadIcs(icsFileName(event.title), deadlineIcs(event, now));
    toastSuccess(t("agenda.downloaded"));
  };

  const sharePayload = () => {
    const title = child
      ? t("share.deadline", { child: child.label, title: event.title })
      : event.title;

    return {
      title,
      text: `${title}\n${t("share.when", { when: label.toLocaleLowerCase(LOCALE) })}`,
      url: `${window.location.origin}/events/${event.id}`,
    };
  };

  return (
    <>
      <EventBadges event={event} />
      <DescriptionList layout="inline">
        <DescriptionItem>
          <DescriptionTerm>{t("detail.deadline")}</DescriptionTerm>
          <DescriptionDetails className="flex flex-wrap items-center gap-2">
            <DeadlineWhen countdown={countdown} label={label} deadlineTime={event.deadlineTime} />
          </DescriptionDetails>
        </DescriptionItem>
        <DescriptionItem>
          <DescriptionTerm>{t("detail.received")}</DescriptionTerm>
          <DescriptionDetails>
            {deadlineLabel(schoolToday(new Date(event.receivedAt)), undefined, now)}
          </DescriptionDetails>
        </DescriptionItem>
        {child && (
          <DescriptionItem>
            <DescriptionTerm>{t("detail.child")}</DescriptionTerm>
            <DescriptionDetails className="flex items-center gap-2">
              <ChildAvatar name={child.label} tone={childHue(family, child.id)} size="xs" />
              {child.label}
            </DescriptionDetails>
          </DescriptionItem>
        )}
      </DescriptionList>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={addToAgenda}>
          <CalendarPlusIcon aria-hidden />
          {t("agenda.add")}
        </Button>
        <ShareButton label={t("share.action")} payload={sharePayload} />
        {event.announcementUrl && (
          <Button asChild variant="outline">
            <a href={event.announcementUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              {t("detail.openInClassroom")}
            </a>
          </Button>
        )}
      </div>
      <PrepareChecklist event={event} />
      {event.description && (
        <section aria-labelledby={descriptionId} className="flex flex-col gap-2">
          <TypographyH2 id={descriptionId} variant="section">
            {t("detail.description")}
          </TypographyH2>
          <TypographyP className="wrap-anywhere whitespace-pre-line">
            {event.description}
          </TypographyP>
        </section>
      )}
      {!event.done && (
        <>
          <Separator />
          <EventReminders
            eventId={event.id}
            timed={event.deadlineTime !== undefined}
            needsReview={event.status === "needs_review"}
          />
        </>
      )}
      <Separator />
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to="/events/$eventId/edit" params={{ eventId: event.id }} viewTransition>
            <Pencil aria-hidden />
            {t("detail.edit")}
          </Link>
        </Button>
        <DeleteEventDialog eventId={event.id} eventTitle={event.title} onDeleted={onDeleted} />
      </div>
    </>
  );
}
