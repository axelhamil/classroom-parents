import { useCallback, useEffect, useRef } from "react";

export interface Debounced<T> {
  schedule: (value: T) => void;
  flush: () => void;
}

/** Runs the last scheduled value once input pauses, at once on `flush`, and before unmount. */
export function useDebounced<T>(run: (value: T) => void, pauseMs: number): Debounced<T> {
  const pending = useRef<{ value: T; timer: number } | null>(null);

  const flush = useCallback(() => {
    const due = pending.current;
    if (!due) return;

    window.clearTimeout(due.timer);
    pending.current = null;
    run(due.value);
  }, [run]);

  const schedule = (value: T) => {
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = { value, timer: window.setTimeout(flush, pauseMs) };
  };

  useEffect(() => flush, [flush]);

  return { schedule, flush };
}
