import { useEffect, useState } from "react";

/**
 * Counts the times the page comes back to the foreground after at least `minMs` hidden, so a
 * screen can read the world again on return without ever moving while it is watched. No timer:
 * the time away is measured between the two visibility changes.
 */
export function useForegroundReturn(minMs: number): number {
  const [returns, setReturns] = useState(0);

  useEffect(() => {
    let hiddenAt: number | null = null;

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }

      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (away >= minMs) setReturns((count) => count + 1);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [minMs]);

  return returns;
}
