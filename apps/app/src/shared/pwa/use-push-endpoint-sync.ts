import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { savePushSubscriptionMutationOptions } from "../api/mutations/save-push-subscription";
import { captureError } from "../observability/sentry";
import {
  currentPushSubscription,
  forgetPushOwner,
  pushPermission,
  rememberPushOwner,
  storedPushOwner,
  toSubscriptionBody,
} from "./push-support";

export function usePushEndpointSync(userId: string): void {
  const { mutate } = useMutation(savePushSubscriptionMutationOptions);

  useEffect(() => {
    if (pushPermission() !== "granted") return;

    currentPushSubscription()
      .then((subscription) => {
        if (!subscription) {
          forgetPushOwner();
          return;
        }

        const owner = storedPushOwner();
        if (owner?.userId !== userId || owner.endpoint === subscription.endpoint) return;

        mutate(toSubscriptionBody(subscription), {
          onSuccess: () => rememberPushOwner({ userId, endpoint: subscription.endpoint }),
        });
      })
      .catch((error: unknown) => captureError(error, { area: "push" }));
  }, [mutate, userId]);
}
