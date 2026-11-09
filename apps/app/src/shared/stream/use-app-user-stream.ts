import { useUserStream } from "@packages/web-kit/stream/use-user-stream";
import { connectUserStream } from "../api/user-stream";
import { captureError } from "../observability/sentry";
import {
  parseUserStreamMessage,
  USER_STREAM_INVALIDATIONS,
  USER_STREAM_RECONNECT_KEYS,
} from "./user-stream-invalidations";

function reportStreamFailure(error: unknown): void {
  captureError(error, { area: "user-stream" });
}

export function useAppUserStream(): void {
  useUserStream({
    connect: connectUserStream,
    parse: parseUserStreamMessage,
    invalidations: USER_STREAM_INVALIDATIONS,
    reconnectKeys: USER_STREAM_RECONNECT_KEYS,
    onServerFailure: reportStreamFailure,
  });
}
