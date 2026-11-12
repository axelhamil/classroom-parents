import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  disablePushMutationOptions,
  enablePushMutationOptions,
} from "../api/mutations/toggle-push";
import { PUSH_STATUS_KEY } from "../api/queries/push-status";
import { captureError } from "../observability/sentry";
import {
  currentPushSubscription,
  isOwnedBy,
  type PushPermission,
  pushPermission,
} from "./push-support";

export interface PushSubscriptionState {
  permission: PushPermission;
  subscribed: boolean;
  pending: boolean;
  enable(): Promise<void>;
  disable(): Promise<void>;
}

export function usePushSubscription(userId: string): PushSubscriptionState {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const [permission, setPermission] = useState(pushPermission);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (permission === "unsupported") return;

    let active = true;
    currentPushSubscription()
      .then((subscription) => {
        if (active) setSubscribed(isOwnedBy(userId, subscription));
      })
      .catch((error: unknown) => captureError(error, { area: "push" }));

    return () => {
      active = false;
    };
  }, [permission, userId]);

  const invalidateStatus = () => queryClient.invalidateQueries({ queryKey: PUSH_STATUS_KEY });

  const enableMutation = useMutation({
    ...enablePushMutationOptions,
    onSuccess: (granted) => {
      setPermission(granted);
      if (granted !== "granted") return;

      setSubscribed(true);
      void invalidateStatus();
      toastSuccess(t("push.enabledToast"));
    },
    onError: (error) => toastError(error, t("push.enableFailed")),
  });

  const disableMutation = useMutation({
    ...disablePushMutationOptions,
    onSuccess: () => {
      setSubscribed(false);
      void invalidateStatus();
      toastSuccess(t("push.disabledToast"));
    },
    onError: (error) => {
      currentPushSubscription()
        .then((subscription) => setSubscribed(isOwnedBy(userId, subscription)))
        .catch((cause: unknown) => captureError(cause, { area: "push" }));
      toastError(error, t("push.disableFailed"));
    },
  });

  return {
    permission,
    subscribed,
    pending: enableMutation.isPending || disableMutation.isPending,
    enable: () =>
      new Promise((resolve) => enableMutation.mutate(userId, { onSettled: () => resolve() })),
    disable: () =>
      new Promise((resolve) => disableMutation.mutate(undefined, { onSettled: () => resolve() })),
  };
}
