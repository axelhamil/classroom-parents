import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import type { PushSubscriptionBody } from "../../pwa/push-support";
import { api } from "../api-client";

const $save = api.push.subscriptions.$post;

export async function savePushSubscription(body: PushSubscriptionBody): Promise<void> {
  const res = await $save({ json: body });
  if (!res.ok) await throwApiError(res, "savePushSubscription");
}

export const savePushSubscriptionMutationOptions = mutationOptions({
  mutationKey: ["push", "subscriptions", "save"] as const,
  mutationFn: savePushSubscription,
});
