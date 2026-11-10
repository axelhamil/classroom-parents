import { Button } from "@packages/ui/components/ui/button";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { TypographyH2, TypographyP } from "@packages/ui/components/ui/typography";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, BellRing } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { wallDateLabel, wallTimeLabel } from "../../../shared/format/deadline-label";
import { clearEventAlertMutationOptions } from "../api/events.mutations";
import { type EventAlert, eventAlertQueryOptions } from "../api/events.queries";
import { AlertTimeForm } from "../forms/alert-time-form";

export interface AlertSettingProps {
  eventId: string;
  deadlineDate: string;
}

function useAlertLabel(alert: EventAlert): string {
  const { t } = useTranslation("events");
  if (!alert) return t("alert.none");
  if (alert.origin === "default") return t("alert.default");

  return t("alert.custom", {
    date: wallDateLabel(alert.date, new Date()),
    time: wallTimeLabel(alert.time),
  });
}

export function AlertSetting({ eventId, deadlineDate }: AlertSettingProps) {
  const { t } = useTranslation("events");
  const query = useQuery(eventAlertQueryOptions(eventId));

  return (
    <section aria-labelledby="alert-setting-title" className="flex flex-col gap-3">
      <TypographyH2 id="alert-setting-title" variant="section">
        {t("alert.title")}
      </TypographyH2>
      {query.isPending ? (
        <SkeletonGroup label={t("alert.loading")}>
          <Skeleton className="h-6 w-48" />
        </SkeletonGroup>
      ) : query.isError ? (
        <LoadErrorAlert
          message={t("alert.loadError")}
          retry={
            <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
              {t("list.retry")}
            </Button>
          }
        />
      ) : (
        <AlertState eventId={eventId} deadlineDate={deadlineDate} alert={query.data} />
      )}
    </section>
  );
}

interface AlertStateProps extends AlertSettingProps {
  alert: EventAlert;
}

function AlertState({ eventId, deadlineDate, alert }: AlertStateProps) {
  const { t } = useTranslation("events");
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const label = useAlertLabel(alert);
  const reset = useMutation({
    ...clearEventAlertMutationOptions,
    onSuccess: async () => {
      const left = await queryClient.fetchQuery({
        ...eventAlertQueryOptions(eventId),
        staleTime: 0,
      });
      toastSuccess(left ? t("alert.restored") : t("alert.removed"));
    },
    onError: (error) => toastError(error, errorFallback("clearEventAlert")),
  });

  if (editing) {
    return (
      <AlertTimeForm
        eventId={eventId}
        defaultValues={
          alert ? { date: alert.date, time: alert.time } : { date: deadlineDate, time: "" }
        }
        onClose={() => setEditing(false)}
      />
    );
  }

  return (
    <>
      <TypographyP className="flex items-center gap-2">
        {alert ? (
          <BellRing aria-hidden className="size-4 shrink-0" />
        ) : (
          <BellOff aria-hidden className="size-4 shrink-0" />
        )}
        {label}
      </TypographyP>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
          {alert ? t("alert.change") : t("alert.add")}
        </Button>
        {alert?.origin === "user" && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={reset.isPending}
            onClick={() => reset.mutate(eventId)}
          >
            {t("alert.reset")}
          </Button>
        )}
      </div>
    </>
  );
}
