import { toAuthClientError } from "@packages/web-kit/api/errors/api-error";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "../../../shared/auth/auth-client";

export const signInWithGoogleMutationOptions = mutationOptions({
  mutationKey: ["session", "sign-in", "google"] as const,
  mutationFn: async (redirectTo: string | undefined): Promise<void> => {
    const origin = window.location.origin;
    const loginPath = redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login";
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: new URL(redirectTo ?? "/", origin).href,
      errorCallbackURL: new URL(loginPath, origin).href,
    });
    if (error) throw toAuthClientError(error, errorFallback("signInWithGoogle"));
  },
});
