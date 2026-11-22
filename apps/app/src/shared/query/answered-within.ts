import type { UseQueryResult } from "@tanstack/react-query";
import { useEffect, useState } from "react";

/**
 * A query that will not change what a screen shows any more without a new request: answered, failed
 * once its retries are spent, or paused offline, where it would otherwise wait forever.
 */
export function hasAnswered(query: UseQueryResult<unknown>): boolean {
  return query.status !== "pending" || query.fetchStatus === "paused";
}

/**
 * Whether a screen may stop waiting on a query: it answered, or it has kept the screen waiting
 * `ms` for the request named `key`. A new key waits again; the timer never outlives the screen.
 */
export function useAnsweredWithin(
  query: UseQueryResult<unknown>,
  key: string,
  ms: number,
): boolean {
  const answered = hasAnswered(query);
  const [givenUpOn, setGivenUpOn] = useState<string | null>(null);

  useEffect(() => {
    if (answered) return;

    const timer = window.setTimeout(() => setGivenUpOn(key), ms);
    return () => window.clearTimeout(timer);
  }, [answered, key, ms]);

  return answered || givenUpOn === key;
}
