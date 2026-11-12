import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { clearUserStorage } from "@packages/web-kit/storage/use-stored-value";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { sessionQueryOptions } from "../api/queries/session";
import { releasePushSubscription } from "../pwa/release-push-subscription";
import { broadcastAuthChange } from "./auth-broadcast";
import { authClient } from "./auth-client";

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation("common");

  return useMutation({
    mutationKey: ["session", "sign-out"],
    mutationFn: async () => {
      await releasePushSubscription();
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? t("userMenu.signOutFailed"));
    },
    onSuccess: () => {
      toastSuccess(t("userMenu.signedOutToast"));
      const signedOut = queryClient.getQueryData(sessionQueryOptions.queryKey);
      if (signedOut) clearUserStorage(signedOut.user.id);
      queryClient.setQueryData(sessionQueryOptions.queryKey, null);

      broadcastAuthChange({ identityChanged: true });

      void navigate({ to: "/login" });
    },
    onError: (err) => toastError(err, t("userMenu.signOutFailed")),
  });
}
