import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { requestSyncMutationOptions } from "../api/mutations/request-sync";
import { childrenQueryOptions } from "../api/queries/children";

const FIRST_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 10 * 60_000;

function retryDelay(failures: number): number {
  return Math.min(FIRST_RETRY_DELAY_MS * 2 ** (failures - 1), MAX_RETRY_DELAY_MS);
}

function syncIsDue(queryClient: QueryClient, now: number): boolean {
  const attempts = queryClient
    .getMutationCache()
    .findAll({ mutationKey: requestSyncMutationOptions.mutationKey });
  if (attempts.some((attempt) => attempt.state.status !== "error")) return false;

  const lastAttemptAt = Math.max(0, ...attempts.map((attempt) => attempt.state.submittedAt));

  return attempts.length === 0 || now - lastAttemptAt >= retryDelay(attempts.length);
}

export function useSyncOnOpen(): void {
  const queryClient = useQueryClient();
  const { mutate } = useMutation({
    ...requestSyncMutationOptions,
    gcTime: Number.POSITIVE_INFINITY,
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: childrenQueryOptions.queryKey }),
  });

  useEffect(() => {
    const requestWhenDue = () => {
      if (document.visibilityState === "hidden") return;
      if (syncIsDue(queryClient, Date.now())) mutate();
    };

    requestWhenDue();
    document.addEventListener("visibilitychange", requestWhenDue);
    window.addEventListener("online", requestWhenDue);

    return () => {
      document.removeEventListener("visibilitychange", requestWhenDue);
      window.removeEventListener("online", requestWhenDue);
    };
  }, [mutate, queryClient]);
}
