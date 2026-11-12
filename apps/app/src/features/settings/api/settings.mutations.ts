import { throwApiError, toAuthClientError } from "@packages/web-kit/api/errors/api-error";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { mutationOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";
import { savePushSubscription } from "../../../shared/api/mutations/save-push-subscription";
import { pushConfigQueryOptions } from "../../../shared/api/queries/push-config";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { queryClient } from "../../../shared/api/query-client";
import { authClient } from "../../../shared/auth/auth-client";
import {
  currentPushSubscription,
  rememberPushOwner,
  subscribeToPush,
  toSubscriptionBody,
  unsubscribeFromPush,
} from "../../../shared/pwa/push-support";
import type { Reminder } from "../../../shared/reminders/reminders.schema";

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

const $setDefaultReminders = api.reminders.defaults.$put;

export const setDefaultRemindersMutationOptions = mutationOptions({
  mutationKey: ["reminders", "defaults", "set"] as const,
  mutationFn: async (reminders: Reminder[]) => {
    const res = await $setDefaultReminders({ json: { reminders } });
    if (!res.ok) await throwApiError(res, "setDefaultReminders");
    return (await res.json()).reminders;
  },
});

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
