import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import {
  CancelledError,
  onlineManager,
  type QueryClient,
  useQueryClient,
} from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

export type Connection = "online" | "offline" | "unstable";

const UNREACHABLE_UPSTREAM = new Set([502, 503, 504]);

export function isConnectionFailure(error: unknown): boolean {
  if (error === null || error === undefined || error instanceof CancelledError) return false;

  const { status } = apiErrorFields(error);

  return status === undefined || UNREACHABLE_UPSTREAM.has(status);
}

function keepsDataThroughFailure(queryClient: QueryClient): boolean {
  return queryClient
    .getQueryCache()
    .getAll()
    .some(
      ({ state }) =>
        state.data !== undefined && state.status === "error" && isConnectionFailure(state.error),
    );
}

export function connectionOf(queryClient: QueryClient): Connection {
  if (!onlineManager.isOnline()) return "offline";

  return keepsDataThroughFailure(queryClient) ? "unstable" : "online";
}

export function useConnection(): Connection {
  const queryClient = useQueryClient();

  return useSyncExternalStore(
    (onChange) => {
      const stopOnline = onlineManager.subscribe(onChange);
      const stopCache = queryClient.getQueryCache().subscribe(onChange);

      return () => {
        stopOnline();
        stopCache();
      };
    },
    () => connectionOf(queryClient),
    () => "online",
  );
}
