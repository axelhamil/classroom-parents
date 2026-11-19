import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { EVENTS_KEY } from "../../../shared/api/queries/events";
import { confirmEventMutationOptions } from "../api/events.mutations";

export function useConfirmEvent() {
  const { t } = useTranslation("events");
  const queryClient = useQueryClient();

  return useMutation({
    ...confirmEventMutationOptions,
    onSuccess: () => {
      toastSuccess(t("review.confirmed"));
      void queryClient.invalidateQueries({ queryKey: EVENTS_KEY });
    },
    onError: (error) => toastError(error, errorFallback("confirmEvent")),
  });
}
