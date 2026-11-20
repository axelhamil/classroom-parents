import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EVENTS_KEY, type EventItem } from "../../../shared/api/queries/events";
import { confirmByTouch } from "../../../shared/motion/haptic";
import {
  confirmEventMutationOptions,
  unconfirmEventMutationOptions,
} from "../api/events.mutations";
import { patchCachedEvent } from "../api/events.queries";

export const REVIEW_UNDO_WINDOW_MS = 5000;

export function useReviewConfirmation() {
  const { t } = useTranslation("home");
  const queryClient = useQueryClient();
  const confirm = useMutation(confirmEventMutationOptions);
  const unconfirm = useMutation(unconfirmEventMutationOptions);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: EVENTS_KEY });

  return async (event: EventItem) => {
    confirmByTouch();
    const rollback = await patchCachedEvent(queryClient, event.id, () => ({ status: "confirmed" }));
    let undone = false;

    const sent = confirm.mutateAsync(event.id).then(
      () => {
        if (!undone) refresh();
        return true;
      },
      (error: unknown) => {
        rollback();
        toastError(error, errorFallback("confirmEvent"));
        refresh();
        return false;
      },
    );

    const undo = async () => {
      undone = true;
      rollback();
      if (!(await sent)) return;

      await unconfirm.mutateAsync(event.id).catch((error: unknown) => {
        toastError(error, errorFallback("unconfirmEvent"));
      });
      refresh();
    };

    toast(t("blocks.review.confirmed", { title: event.title }), {
      id: `review:${event.id}`,
      duration: REVIEW_UNDO_WINDOW_MS,
      action: { label: t("blocks.review.undo"), onClick: () => void undo() },
    });
  };
}
