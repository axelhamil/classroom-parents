import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { api } from "../api-client";

const $delete = api.push.subscriptions.$delete;

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const res = await $delete({ json: { endpoint } });
  if (!res.ok) await throwApiError(res, "deletePushSubscription");
}
