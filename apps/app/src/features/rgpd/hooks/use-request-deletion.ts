import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { clearUserStorage } from "@packages/web-kit/storage/use-stored-value";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { requestAccountDeletionMutationOptions } from "../../../shared/api/mutations/request-account-deletion";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { useRefreshSession } from "../../../shared/auth/use-refresh-session";
import { deletionPreflightQueryOptions } from "../api/rgpd.queries";

const REAUTH_REQUIRED = "ACCOUNT_REAUTH_REQUIRED";

export function useRequestDeletion(userId: string) {
  const { t } = useTranslation("settings");
  const refreshSession = useRefreshSession();
  const queryClient = useQueryClient();
  const [reauthRequired, setReauthRequired] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [checking, setChecking] = useState(false);

  const mutation = useMutation({
    ...requestAccountDeletionMutationOptions,
    onSuccess: async () => {
      setReauthRequired(false);
      const deleted = queryClient.getQueryData(sessionQueryOptions.queryKey);
      if (deleted) clearUserStorage(deleted.user.id);
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

  const start = async () => {
    setChecking(true);
    const preflight = await queryClient
      .fetchQuery(deletionPreflightQueryOptions(userId))
      .catch(() => ({ reauthRequired: false }));
    setChecking(false);

    if (preflight.reauthRequired) setReauthRequired(true);
    else setConfirming(true);
  };

  return {
    start: () => void start(),
    request: () => mutation.mutate(),
    isPending: checking || mutation.isPending,
    confirming,
    setConfirming,
    reauthRequired,
  };
}
