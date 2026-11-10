import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { requestAccountDeletionMutationOptions } from "../../../shared/api/mutations/request-account-deletion";
import { useRefreshSession } from "../../../shared/auth/use-refresh-session";

const REAUTH_REQUIRED = "ACCOUNT_REAUTH_REQUIRED";

export function useRequestDeletion() {
  const { t } = useTranslation("settings");
  const refreshSession = useRefreshSession();
  const [reauthRequired, setReauthRequired] = useState(false);

  const mutation = useMutation({
    ...requestAccountDeletionMutationOptions,
    onSuccess: async () => {
      setReauthRequired(false);
      await refreshSession();
      toastSuccess(t("deletion.requestedToast"));
    },
    onError: (error) => {
      if (apiErrorFields(error).code === REAUTH_REQUIRED) {
        setReauthRequired(true);
        return;
      }

      toastError(error, t("deletion.requestFailed"));
    },
  });

  return {
    request: () => mutation.mutate(),
    isPending: mutation.isPending,
    reauthRequired,
  };
}
