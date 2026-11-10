import { toAuthClientError } from "@packages/web-kit/api/errors/api-error";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "../../../shared/auth/auth-client";

export const signInWithGoogleMutationOptions = mutationOptions({
  mutationKey: ["session", "sign-in", "google"] as const,
  mutationFn: async (redirectTo: string | undefined): Promise<void> => {
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: new URL(redirectTo ?? "/", window.location.origin).href,
    });
    if (error) throw toAuthClientError(error, errorFallback("signInWithGoogle"));
  },
});
