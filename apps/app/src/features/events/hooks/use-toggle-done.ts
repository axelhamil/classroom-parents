import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { EVENTS_KEY } from "../../../shared/api/queries/events";
import { useUndoChannel } from "../../../shared/layout/responsive-overlay";
import { markEventDoneMutationOptions } from "../api/events.mutations";
import { patchCachedEvent } from "../api/events.queries";

export function useToggleDone() {
  const { t } = useTranslation("events");
  const queryClient = useQueryClient();
  const undoChannel = useUndoChannel();
  const toggle = useMutation({
    ...markEventDoneMutationOptions,
    onMutate: async ({ eventId, done }) => ({
      rollback: await patchCachedEvent(queryClient, eventId, () => ({ done })),
    }),
    onError: (error, _toggle, context) => {
      context?.rollback();
      toastError(error, errorFallback("markEventDone"));
    },
    onSuccess: (_result, { eventId, done }) => {
      const id = `done:${eventId}`;
      if (!done) return undoChannel.withdraw(id);

      undoChannel.offer({
        id,
        message: t("calendar.doneToast"),
        label: t("calendar.undo"),
        undo: () => toggle.mutate({ eventId, done: false }),
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: EVENTS_KEY }),
  });

  return toggle;
}
