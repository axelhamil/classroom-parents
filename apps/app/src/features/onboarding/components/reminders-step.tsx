import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { Spinner } from "@packages/ui/components/ui/spinner";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, CalendarClock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { setDefaultRemindersMutationOptions } from "../../../shared/api/mutations/set-default-reminders";
import type { ChildDto } from "../../../shared/api/queries/children";
import { defaultRemindersQueryOptions } from "../../../shared/api/queries/default-reminders";
import { EVENTS_KEY } from "../../../shared/api/queries/events";
import { firstEventsQueryOptions } from "../../../shared/children/child-link.queries";
import { QueryState } from "../../../shared/query/query-state";
import type { Reminder } from "../../../shared/reminders/reminders.schema";
import { RemindersForm } from "../../../shared/reminders/reminders-form";
import { useReminderLabel } from "../../../shared/reminders/use-reminder-label";
import { StepFrame } from "./step-frame";

const LIST_FORMAT = new Intl.ListFormat("fr-FR", { type: "conjunction" });
const FORM_ID = "onboarding-reminders";

function inSentence(label: string): string {
  return label.charAt(0).toLocaleLowerCase("fr-FR") + label.slice(1);
}

export interface RemindersStepProps {
  child: ChildDto;
  userId: string;
  onNext: () => void;
}

interface ReminderPreviewProps {
  childId: string;
  reminders: Reminder[];
}

function ReminderPreview({ childId, reminders }: ReminderPreviewProps) {
  const { t } = useTranslation("onboarding");
  const label = useReminderLabel();
  const first = useQuery(firstEventsQueryOptions(childId, true)).data?.[0];
  if (!first) return null;

  return (
    <Alert variant="info">
      <CalendarClock aria-hidden />
      <AlertDescription>
        {reminders.length === 0
          ? t("reminders.previewNone")
          : t("reminders.preview", {
              title: first.title,
              reminders: LIST_FORMAT.format(
                reminders.map((reminder) => inSentence(label(reminder))),
              ),
            })}
      </AlertDescription>
    </Alert>
  );
}

export function RemindersStep({ child, userId, onNext }: RemindersStepProps) {
  const { t } = useTranslation("onboarding");
  const queryClient = useQueryClient();
  const query = useQuery(defaultRemindersQueryOptions(userId));
  const save = useMutation({
    ...setDefaultRemindersMutationOptions,
    onSuccess: (reminders) => {
      queryClient.setQueryData(defaultRemindersQueryOptions(userId).queryKey, reminders);
      void queryClient.invalidateQueries({ queryKey: EVENTS_KEY });
      onNext();
    },
    onError: (error) => toastError(error, t("reminders.saveFailed")),
  });

  return (
    <StepFrame
      media={<AlarmClock />}
      title={t("reminders.title")}
      description={t("reminders.description")}
      actions={
        <>
          <Button
            type="submit"
            form={FORM_ID}
            size="lg"
            disabled={save.isPending || !query.isSuccess}
          >
            {save.isPending && <Spinner aria-hidden label={t("reminders.save")} />}
            {t("reminders.save")}
          </Button>
          <Button size="lg" variant="ghost" onClick={onNext}>
            {t("reminders.skip")}
          </Button>
        </>
      }
    >
      <QueryState
        query={query}
        skeleton={
          <SkeletonGroup label={t("reminders.loading")}>
            <Skeleton className="h-32 w-full" />
          </SkeletonGroup>
        }
      >
        {(reminders) => (
          <div className="flex flex-col gap-4">
            <ReminderPreview childId={child.id} reminders={reminders} />
            <RemindersForm
              key={JSON.stringify(reminders)}
              reminders={reminders}
              allowHours
              pending={save.isPending}
              formId={FORM_ID}
              onSubmit={(next) => save.mutate(next)}
            />
          </div>
        )}
      </QueryState>
    </StepFrame>
  );
}
