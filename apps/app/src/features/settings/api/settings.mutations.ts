import { throwApiError, toAuthClientError } from "@packages/web-kit/api/errors/api-error";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { api } from "../../../shared/api/api-client";
import { authClient } from "../../../shared/auth/auth-client";

const $setDigest = api.reminders.digest.$put;

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

export const setDigestMutationOptions = mutationOptions({
  mutationKey: ["reminders", "digest", "set"] as const,
  mutationFn: async (enabled: boolean) => {
    const res = await $setDigest({ json: { enabled } });
    if (!res.ok) await throwApiError(res, "setDigest");
    return (await res.json()).enabled;
  },
});

const $setSchoolZone = api["school-calendar"].zone.$put;

export type SchoolZoneChoice = InferRequestType<typeof $setSchoolZone>["json"];

export const setSchoolZoneMutationOptions = mutationOptions({
  mutationKey: ["school-calendar", "zone", "set"] as const,
  mutationFn: async (choice: SchoolZoneChoice) => {
    const res = await $setSchoolZone({ json: choice });
    if (!res.ok) await throwApiError(res, "setSchoolZone");
    return res.json();
  },
});
