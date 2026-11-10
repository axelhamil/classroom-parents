import { deletePushSubscription } from "../api/mutations/delete-push-subscription";
import { captureError } from "../observability/sentry";
import { forgetPushOwner, pushPermission } from "./push-support";

function reportPushFailure(error: unknown): void {
  captureError(error, { area: "push" });
}

export async function releasePushSubscription(): Promise<void> {
  if (pushPermission() === "unsupported") return;

  forgetPushOwner();
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  await deletePushSubscription(subscription.endpoint).catch(reportPushFailure);
  await subscription.unsubscribe().catch(reportPushFailure);
}
