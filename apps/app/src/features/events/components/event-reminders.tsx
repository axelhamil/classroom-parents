import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { ReminderIcon } from "@packages/ui/components/ui/icons";
import { ListRow, ListRowContent } from "@packages/ui/components/ui/list-row";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import {
  TypographyH2,
  TypographyInline,
  TypographyMuted,
  TypographyP,
} from "@packages/ui/components/ui/typography";
import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import { formatApiError } from "@packages/web-kit/api/errors/messages";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SchoolClock } from "../../../shared/agenda/school-clock";
import { useSchoolClock } from "../../../shared/agenda/school-clock-context";
import { inSentence, instantLabel } from "../../../shared/format/deadline-label";
import { refusedReminder } from "../../../shared/reminders/reminders.schema";
import { RemindersForm } from "../../../shared/reminders/reminders-form";
import { useReminderLabel } from "../../../shared/reminders/use-reminder-label";
import {
  customizeEventRemindersMutationOptions,
  resetEventRemindersMutationOptions,
} from "../api/events.mutations";
import {
  type EventReminders as EventRemindersData,
  eventRemindersQueryOptions,
} from "../api/events.queries";
import { REMINDER_STATUS_LABEL_KEYS } from "../reminder-labels";

export interface EventRemindersProps {
  eventId: string;
  timed: boolean;
  needsReview: boolean;
}

export function EventReminders({ eventId, timed, needsReview }: EventRemindersProps) {
  const { t } = useTranslation("events");
  const query = useQuery(eventRemindersQueryOptions(eventId));
  if (query.isError && apiErrorFields(query.error).status === 404) return null;

  return (
    <section
      aria-labelledby="event-reminders-title"
      data-tour="event-detail-reminders"
      className="flex flex-col gap-3"
    >
      <TypographyH2 id="event-reminders-title" variant="section">
        {t("reminders.title")}
      </TypographyH2>
      {query.isPending ? (
        <SkeletonGroup label={t("reminders.loading")}>
          <Skeleton className="h-6 w-48" />
        </SkeletonGroup>
      ) : query.isError ? (
        <LoadErrorAlert
          message={t("reminders.loadError")}
          retry={
            <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
              {t("list.retry")}
            </Button>
          }
        />
      ) : (
        <RemindersState
          eventId={eventId}
          timed={timed}
          needsReview={needsReview}
          data={query.data}
        />
      )}
    </section>
  );
}

interface RemindersStateProps extends EventRemindersProps {
  data: EventRemindersData;
}

function RemindersState({ eventId, timed, needsReview, data }: RemindersStateProps) {
  const { t } = useTranslation("events");
  const { t: tErrors } = useTranslation("errors");
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const label = useReminderLabel();
  const queryKey = eventRemindersQueryOptions(eventId).queryKey;
  const clock = useSchoolClock();
  const waitsForReview = needsReview && !data.customized;
  const customize = useMutation({
    ...customizeEventRemindersMutationOptions,
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved);
      toastSuccess(t("reminders.saved"));
      setEditing(false);
    },
  });
  const reset = useMutation({
    ...resetEventRemindersMutationOptions,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toastSuccess(t("reminders.restored"));
    },
    onError: (error) => toastError(error, errorFallback("resetEventReminders")),
  });

  if (editing) {
    const fitting = data.reminders.filter((item) => item.fits);
    const dropped = data.reminders.length - fitting.length;

    return (
      <>
        {dropped > 0 ? (
          <TypographyMuted>{t("reminders.dropped", { count: dropped })}</TypographyMuted>
        ) : null}
        <RemindersForm
          reminders={fitting.map((item) => item.reminder)}
          allowHours={timed}
          pending={customize.isPending}
          onSubmit={(reminders, refuse) =>
            customize.mutate(
              { eventId, reminders },
              {
                onError: (error) => {
                  const fallback = errorFallback("customizeEventReminders");
                  const reminder = refusedReminder(apiErrorFields(error).metadata);
                  if (!reminder) return toastError(error, fallback);

                  refuse({ reminder, message: formatApiError(error, fallback, tErrors) });
                },
              },
            )
          }
          onCancel={() => setEditing(false)}
        />
      </>
    );
  }

  const next = nextAmongSeveral(data, clock);

  return (
    <>
      {next && <TypographyP>{t("reminders.next", { when: next })}</TypographyP>}
      {data.reminders.length === 0 ? (
        <TypographyP>{t("reminders.none")}</TypographyP>
      ) : (
        <ul className="flex flex-col">
          {data.reminders.map((item) => (
            <ListRow key={JSON.stringify(item.reminder)} variant="ruled">
              <ListRowContent className="min-w-0">
                <TypographyInline size="sm">{label(item.reminder)}</TypographyInline>
                {item.dueAt && item.status !== "unplanned" ? (
                  <TypographyInline size="xs" tone="muted">
                    {t("reminders.due", { when: instantLabel(item.dueAt, clock) })}
                  </TypographyInline>
                ) : null}
                {item.status === "unplanned" && !waitsForReview ? (
                  <TypographyInline size="xs" tone="muted">
                    {t(UNPLANNED_REASON_KEYS[unplannedReason(item, clock.now)])}
                  </TypographyInline>
                ) : null}
              </ListRowContent>
              <Badge variant="secondary">{t(REMINDER_STATUS_LABEL_KEYS[item.status])}</Badge>
            </ListRow>
          ))}
        </ul>
      )}
      <TypographyMuted>
        {data.customized ? t("reminders.customized") : t("reminders.fromDefaults")}
      </TypographyMuted>
      {waitsForReview ? <TypographyMuted>{t("reminders.awaitingReview")}</TypographyMuted> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
          <ReminderIcon aria-hidden />
          {t("reminders.edit")}
        </Button>
        {data.customized ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={reset.isPending}
            onClick={() => reset.mutate(eventId)}
          >
            {t("reminders.reset")}
          </Button>
        ) : null}
      </div>
    </>
  );
}

type ReminderItem = EventRemindersData["reminders"][number];

type UnplannedReason = "passed" | "waiting";

const UNPLANNED_REASON_KEYS = {
  passed: "reminders.unplannedReason.passed",
  waiting: "reminders.unplannedReason.waiting",
} as const satisfies Record<UnplannedReason, string>;

function unplannedReason(item: ReminderItem, now: Date): UnplannedReason {
  return item.dueAt !== null && new Date(item.dueAt) <= now ? "passed" : "waiting";
}

function nextAmongSeveral(data: EventRemindersData, clock: SchoolClock): string | null {
  if (data.reminders.length < 2) return null;

  const next = data.reminders.find((item) => item.status === "pending" && item.dueAt);

  return next?.dueAt ? inSentence(instantLabel(next.dueAt, clock)) : null;
}
