import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { ListRow, ListRowContent } from "@packages/ui/components/ui/list-row";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { TypographyH2, TypographyMuted, TypographyP } from "@packages/ui/components/ui/typography";
import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import { formatApiError } from "@packages/web-kit/api/errors/messages";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { instantLabel } from "../../../shared/format/deadline-label";
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
  const now = new Date();
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

  return (
    <>
      <TypographyMuted>
        {data.customized ? t("reminders.customized") : t("reminders.fromDefaults")}
      </TypographyMuted>
      {needsReview && !data.customized ? (
        <TypographyMuted>{t("reminders.awaitingReview")}</TypographyMuted>
      ) : null}
      {data.reminders.length === 0 ? (
        <TypographyP>{t("reminders.none")}</TypographyP>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.reminders.map((item) => (
            <ListRow key={JSON.stringify(item.reminder)} className="items-start">
              <ListRowContent className="min-w-0">
                <TypographyP>{label(item.reminder)}</TypographyP>
                {item.dueAt && item.status !== "unplanned" ? (
                  <TypographyMuted>
                    {t("reminders.due", { when: instantLabel(item.dueAt, now) })}
                  </TypographyMuted>
                ) : null}
              </ListRowContent>
              <Badge variant="secondary">{t(REMINDER_STATUS_LABEL_KEYS[item.status])}</Badge>
            </ListRow>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
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
