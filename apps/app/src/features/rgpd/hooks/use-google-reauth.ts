import { toAuthClientError } from "@packages/web-kit/api/errors/api-error";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { authClient } from "../../../shared/auth/auth-client";

export function useGoogleReauth(returnPath: string) {
  const { t } = useTranslation("settings");

  return useMutation({
    mutationKey: ["session", "reauth", "google"],
    mutationFn: async () => {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: new URL(returnPath, window.location.origin).href,
      });
      if (error) throw toAuthClientError(error, t("deletion.reauthFailed"));
    },
    onError: (error) => toastError(error, t("deletion.reauthFailed")),
  });
}
