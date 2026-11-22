import { useSyncExternalStore } from "react";

/** The widths, in rem, from which the layout changes: four, then three cards a row, wide, tablet. */
export const FOUR_CARDS_MIN_REM = 100;
export const THREE_CARDS_MIN_REM = 80;
export const WIDE_MIN_REM = 64;
export const TABLET_MIN_REM = 48;

export const FOUR_CARDS_QUERY = minWidthQuery(FOUR_CARDS_MIN_REM);
export const THREE_CARDS_QUERY = minWidthQuery(THREE_CARDS_MIN_REM);
export const WIDE_QUERY = minWidthQuery(WIDE_MIN_REM);
export const TABLET_QUERY = minWidthQuery(TABLET_MIN_REM);

/** The media query a window at least `rem` wide matches. */
export function minWidthQuery(rem: number): string {
  return `(min-width: ${rem}rem)`;
}

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
