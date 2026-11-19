import { useEffect } from "react";

type Loader = () => Promise<unknown>;

function whenIdle(run: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(run);
    return () => window.cancelIdleCallback(handle);
  }

  const handle = window.setTimeout(run, 1);
  return () => window.clearTimeout(handle);
}

/**
 * Fetches the chunks a screen opens on demand (a dialog's form, a sheet) once the
 * screen has painted and the main thread is idle, so they stay off the path to
 * the first paint without making the first opening wait on the network. Pass a
 * module-level list: a new array on every render would fetch again each time.
 */
export function usePrefetchWhenIdle(loaders: readonly Loader[]): void {
  useEffect(
    () =>
      whenIdle(() => {
        for (const load of loaders) void load();
      }),
    [loaders],
  );
}
