import { captureError } from "../observability/sentry";
import { forgetPushOwner, pushPermission, unsubscribeFromPush } from "./push-support";

export async function releasePushSubscription(): Promise<void> {
  if (pushPermission() === "unsupported") return;

  forgetPushOwner();
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  await unsubscribeFromPush(subscription).catch((error: unknown) =>
    captureError(error, { area: "push" }),
  );
}
