import { UserStreamMessage } from "@packages/events/user-stream-message";
import type { StreamInvalidations } from "@packages/web-kit/stream/use-user-stream";
import type { QueryKey } from "@tanstack/react-query";

export const USER_STREAM_INVALIDATIONS: StreamInvalidations<UserStreamMessage["type"]> = {
  "events.changed": [["events"]],
  "children.changed": [["children"]],
  "sync.finished": [["events"], ["children"]],
};

export const USER_STREAM_RECONNECT_KEYS: readonly QueryKey[] = [["events"], ["children"]];

export function parseUserStreamMessage(value: unknown): UserStreamMessage | undefined {
  const result = UserStreamMessage.safeParse(value);

  return result.success ? result.data : undefined;
}
