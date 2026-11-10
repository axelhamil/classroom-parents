import { toAuthClientError } from "@packages/web-kit/api/errors/api-error";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { signInWithGoogle } from "../../../shared/auth/sign-in-with-google";

export const REAUTH_FAILED = "failed";

export function useGoogleReauth(returnPath: string) {
  const { t } = useTranslation("settings");
  const { data: session } = useQuery(sessionQueryOptions);

  return useMutation({
    mutationKey: ["session", "reauth", "google"],
    mutationFn: async () => {
      const { error } = await signInWithGoogle({
        callbackPath: returnPath,
        errorPath: `${returnPath}?reauth=${REAUTH_FAILED}`,
        loginHint: session?.user.email,
      });
      if (error) throw toAuthClientError(error, t("deletion.reauthFailed"));
    },
    onError: (error) => toastError(error, t("deletion.reauthFailed")),
  });
}
