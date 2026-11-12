import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";

const NAVIGATE_MESSAGE = "keepupkids:navigate";

const navigateMessageSchema = z.object({
  type: z.literal(NAVIGATE_MESSAGE),
  path: z.string().regex(/^\/(?![/\\])/),
});

export function useNotificationNavigation(): void {
  const router = useRouter();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const container = navigator.serviceWorker;
    const onMessage = (event: MessageEvent) => {
      const message = navigateMessageSchema.safeParse(event.data);
      if (!message.success) return;

      router.history.push(message.data.path);
      event.ports[0]?.postMessage("navigated");
    };
    container.addEventListener("message", onMessage);
    return () => container.removeEventListener("message", onMessage);
  }, [router]);
}
