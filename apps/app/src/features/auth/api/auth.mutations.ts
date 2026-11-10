import { toAuthClientError } from "@packages/web-kit/api/errors/api-error";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { mutationOptions } from "@tanstack/react-query";
import { signInWithGoogle } from "../../../shared/auth/sign-in-with-google";

export const signInWithGoogleMutationOptions = mutationOptions({
  mutationKey: ["session", "sign-in", "google"] as const,
  mutationFn: async (redirectTo: string | undefined): Promise<void> => {
    const { error } = await signInWithGoogle({
      callbackPath: redirectTo ?? "/",
      errorPath: redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login",
    });
    if (error) throw toAuthClientError(error, errorFallback("signInWithGoogle"));
  },
});
