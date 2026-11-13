import { useSyncExternalStore } from "react";

export const WIDE_QUERY = "(min-width: 64rem)";
export const TABLET_QUERY = "(min-width: 48rem)";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", listener);

      return () => list.removeEventListener("change", listener);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
