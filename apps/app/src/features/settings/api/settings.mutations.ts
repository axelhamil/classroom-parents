import { toAuthClientError } from "@packages/web-kit/api/errors/api-error";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "../../../shared/auth/auth-client";

export const revokeSessionMutationOptions = mutationOptions({
  mutationKey: ["sessions", "revoke"] as const,
  mutationFn: async (token: string): Promise<void> => {
    const { error } = await authClient.revokeSession({ token });
    if (error) throw toAuthClientError(error, errorFallback("revokeSession"));
  },
});

export const revokeOtherSessionsMutationOptions = mutationOptions({
  mutationKey: ["sessions", "revoke-others"] as const,
  mutationFn: async (): Promise<void> => {
    const { error } = await authClient.revokeOtherSessions();
    if (error) throw toAuthClientError(error, errorFallback("revokeOtherSessions"));
  },
});
