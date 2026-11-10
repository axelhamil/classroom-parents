import { mutationOptions } from "@tanstack/react-query";
import { deletePushSubscription } from "../../../shared/api/mutations/delete-push-subscription";
import { savePushSubscription } from "../../../shared/api/mutations/save-push-subscription";
import { pushConfigQueryOptions } from "../../../shared/api/queries/push-config";
import { queryClient } from "../../../shared/api/query-client";
import {
  currentPushSubscription,
  forgetPushOwner,
  rememberPushOwner,
  subscribeToPush,
  toSubscriptionBody,
} from "../../../shared/pwa/push-support";

export const enablePushMutationOptions = mutationOptions({
  mutationKey: ["push", "subscriptions", "enable"] as const,
  mutationFn: async (userId: string): Promise<NotificationPermission> => {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission;

    const { vapidPublicKey } = await queryClient.fetchQuery(pushConfigQueryOptions);
    const subscription = await subscribeToPush(vapidPublicKey);
    await savePushSubscription(toSubscriptionBody(subscription));
    rememberPushOwner({ userId, endpoint: subscription.endpoint });

    return permission;
  },
});

export const disablePushMutationOptions = mutationOptions({
  mutationKey: ["push", "subscriptions", "disable"] as const,
  mutationFn: async (): Promise<void> => {
    const subscription = await currentPushSubscription();
    if (!subscription) return;

    await deletePushSubscription(subscription.endpoint);

    await subscription.unsubscribe();
    forgetPushOwner();
  },
});
