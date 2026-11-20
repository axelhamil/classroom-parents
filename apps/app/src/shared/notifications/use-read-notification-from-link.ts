import { NOTIFICATION_REF_PARAM } from "@packages/events/notification-ref";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { markNotificationReadByRefMutationOptions } from "./notifications.mutations";
import { NOTIFICATIONS_KEY } from "./notifications.queries";

interface LinkedNotification {
  ref: string;
  cleanHref: string;
}

export function linkedNotification(href: string): LinkedNotification | null {
  const url = new URL(href, "http://app.local");
  const ref = url.searchParams.get(NOTIFICATION_REF_PARAM);
  if (ref === null) return null;

  url.searchParams.delete(NOTIFICATION_REF_PARAM);

  return { ref, cleanHref: `${url.pathname}${url.search}${url.hash}` };
}

export function useReadNotificationFromLink(): void {
  const router = useRouter();
  const queryClient = useQueryClient();
  const href = useRouterState({ select: (state) => state.location.href });
  const handled = useRef<string | null>(null);
  const { mutate: markRead } = useMutation({
    ...markNotificationReadByRefMutationOptions,
    onSettled: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });

  useEffect(() => {
    const linked = linkedNotification(href);
    if (linked === null || handled.current === href) return;

    handled.current = href;
    markRead(linked.ref);
    router.history.replace(linked.cleanHref);
  }, [href, markRead, router]);
}
