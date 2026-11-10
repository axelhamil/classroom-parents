import { Button } from "@packages/ui/components/ui/button";
import { DestructiveActionDialog } from "@packages/ui/components/ui/destructive-action-dialog";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { deleteEventMutationOptions } from "../api/events.mutations";
import { eventQueryOptions } from "../api/events.queries";

export interface DeleteEventDialogProps {
  eventId: string;
  eventTitle: string;
  onDeleted: () => void;
}

export function DeleteEventDialog({ eventId, eventTitle, onDeleted }: DeleteEventDialogProps) {
  const { t } = useTranslation("events");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...deleteEventMutationOptions,
    onSuccess: () => {
      toastSuccess(t("delete.done"));
      queryClient.removeQueries({ queryKey: eventQueryOptions(eventId).queryKey });
      onDeleted();
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (error) => toastError(error, errorFallback("deleteEvent")),
  });

  return (
    <DestructiveActionDialog
      trigger={
        <Button type="button" variant="ghost">
          <Trash2 aria-hidden />
          {t("delete.trigger")}
        </Button>
      }
      title={t("delete.title")}
      description={t("delete.description", { title: eventTitle })}
      actionLabel={t("delete.action")}
      cancelLabel={t("delete.cancel")}
      isPending={mutation.isPending}
      onConfirm={() => mutation.mutate(eventId)}
    />
  );
}
