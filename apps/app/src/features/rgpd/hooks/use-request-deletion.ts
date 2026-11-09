import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { requestAccountDeletionMutationOptions } from "../../../shared/api/mutations/request-account-deletion";
import { useRefreshSession } from "../../../shared/auth/use-refresh-session";

interface UseRequestDeletionOptions {
  onClose: () => void;
}

export function useRequestDeletion({ onClose }: UseRequestDeletionOptions) {
  const { t } = useTranslation("settings");
  const refreshSession = useRefreshSession();

  return useMutation({
    ...requestAccountDeletionMutationOptions,
    onSuccess: async () => {
      await refreshSession();
      onClose();
      toast.success(t("deletion.requestedToast"));
    },
  });
}
