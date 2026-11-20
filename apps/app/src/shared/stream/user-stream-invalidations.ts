import { UserStreamMessage } from "@packages/events/user-stream-message";
import type { StreamInvalidations } from "@packages/web-kit/stream/use-user-stream";
import type { QueryKey } from "@tanstack/react-query";
import { NOTIFICATIONS_KEY } from "../notifications/notifications.queries";

export const USER_STREAM_INVALIDATIONS: StreamInvalidations<UserStreamMessage["type"]> = {
  "events.changed": [["events"]],
  "children.changed": [["children"]],
  "sync.finished": [["events"], ["children"]],
  "notification.created": [NOTIFICATIONS_KEY],
  "notifications.read": [NOTIFICATIONS_KEY],
  "home.changed": [["home", "layout"]],
};

export const USER_STREAM_RECONNECT_KEYS: readonly QueryKey[] = [
  ["events"],
  ["children"],
  NOTIFICATIONS_KEY,
  ["home", "layout"],
];

export function parseUserStreamMessage(value: unknown): UserStreamMessage | undefined {
  const result = UserStreamMessage.safeParse(value);

  return result.success ? result.data : undefined;
}
