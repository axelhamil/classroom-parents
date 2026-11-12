import { Button } from "@packages/ui/components/ui/button";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { setDefaultRemindersMutationOptions } from "../../../shared/api/mutations/set-default-reminders";
import { defaultRemindersQueryOptions } from "../../../shared/api/queries/default-reminders";
import { EVENTS_KEY } from "../../../shared/api/queries/events";
import { RemindersForm } from "../../../shared/reminders/reminders-form";

export interface DefaultRemindersCardProps {
  userId: string;
}

export function DefaultRemindersCard({ userId }: DefaultRemindersCardProps) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const queryClient = useQueryClient();
  const query = useQuery(defaultRemindersQueryOptions(userId));
  const save = useMutation({
    ...setDefaultRemindersMutationOptions,
    onSuccess: (reminders) => {
      queryClient.setQueryData(defaultRemindersQueryOptions(userId).queryKey, reminders);
      void queryClient.invalidateQueries({ queryKey: EVENTS_KEY });
      toastSuccess(t("reminders.saved"));
    },
    onError: (error) => toastError(error, errorFallback("setDefaultReminders")),
  });

  return (
    <SectionCard title={t("reminders.title")} description={t("reminders.description")}>
      {query.isPending ? (
        <SkeletonGroup label={t("reminders.loading")}>
          <Skeleton className="h-24 w-full" />
        </SkeletonGroup>
      ) : query.isError ? (
        <LoadErrorAlert
          message={t("reminders.loadError")}
          retry={
            <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
              {tCommon("actions.retry")}
            </Button>
          }
        />
      ) : (
        <RemindersForm
          key={JSON.stringify(query.data)}
          reminders={query.data}
          allowHours
          pending={save.isPending}
          onSubmit={(reminders) => save.mutate(reminders)}
        />
      )}
    </SectionCard>
  );
}
