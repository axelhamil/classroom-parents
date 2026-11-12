import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import { api } from "../api-client";

const $setLockScreen = api.push["lock-screen"].$put;

export const setLockScreenMutationOptions = mutationOptions({
  mutationKey: ["push", "lock-screen", "set"] as const,
  mutationFn: async (details: boolean) => {
    const res = await $setLockScreen({ json: { details } });
    if (!res.ok) await throwApiError(res, "setLockScreen");
    return (await res.json()).details;
  },
});
