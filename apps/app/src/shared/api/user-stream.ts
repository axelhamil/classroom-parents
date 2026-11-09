import type { UserStreamResponse } from "@packages/web-kit/stream/use-user-stream";
import { env } from "../env";

export function connectUserStream(signal: AbortSignal): Promise<UserStreamResponse> {
  return fetch(new URL("/stream", env.VITE_API_URL), {
    credentials: "include",
    headers: { Accept: "text/event-stream", "X-Request-Id": crypto.randomUUID() },
    signal,
  });
}
