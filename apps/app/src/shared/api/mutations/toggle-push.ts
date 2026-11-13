import { mutationOptions } from "@tanstack/react-query";
import {
  currentPushSubscription,
  rememberPushOwner,
  subscribeToPush,
  toSubscriptionBody,
  unsubscribeFromPush,
} from "../../pwa/push-support";
import { pushConfigQueryOptions } from "../queries/push-config";
import { sessionQueryOptions } from "../queries/session";
import { queryClient } from "../query-client";
import { savePushSubscription } from "./save-push-subscription";

export const enablePushMutationOptions = mutationOptions({
  mutationKey: ["push", "subscriptions", "enable"] as const,
  mutationFn: async (userId: string): Promise<NotificationPermission> => {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission;

    const { vapidPublicKey } = await queryClient.fetchQuery(pushConfigQueryOptions);
    const subscription = await subscribeToPush(vapidPublicKey);
    await savePushSubscription(toSubscriptionBody(subscription));
    rememberPushOwner({
      userId,
      endpoint: subscription.endpoint,
      sessionId: queryClient.getQueryData(sessionQueryOptions.queryKey)?.session.id,
    });

    return permission;
  },
});

export const disablePushMutationOptions = mutationOptions({
  mutationKey: ["push", "subscriptions", "disable"] as const,
  mutationFn: async (): Promise<void> => {
    const subscription = await currentPushSubscription();
    if (!subscription) return;

    await unsubscribeFromPush(subscription);
  },
});
