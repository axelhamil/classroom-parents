import { UserStreamMessage } from "@packages/events";
import { useUserStream } from "@packages/web-kit/stream/use-user-stream";
import { connectUserStream } from "../api/user-stream";
import { captureError } from "../observability/sentry";

function parseUserStreamMessage(value: unknown): UserStreamMessage | undefined {
  const result = UserStreamMessage.safeParse(value);

  return result.success ? result.data : undefined;
}

function reportStreamFailure(error: unknown): void {
  captureError(error, { area: "user-stream" });
}

export function useAppUserStream(): void {
  useUserStream({
    connect: connectUserStream,
    parse: parseUserStreamMessage,
    onServerFailure: reportStreamFailure,
  });
}
