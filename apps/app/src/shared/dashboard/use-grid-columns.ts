import {
  FOUR_CARDS_MIN_REM,
  FOUR_CARDS_QUERY,
  minWidthQuery,
  TABLET_MIN_REM,
  TABLET_QUERY,
  THREE_CARDS_MIN_REM,
  THREE_CARDS_QUERY,
  useMediaQuery,
} from "../layout/use-media-query";
import type { GridColumns } from "./block-size";

/** The font size a rem stands for when nothing changed it: what a width in pixels is read against. */
const ROOT_FONT_PX = 16;

/** From the widest: the columns of cards a window of at least this many rem has. */
const STEPS: readonly (readonly [GridColumns, number])[] = [
  [4, FOUR_CARDS_MIN_REM],
  [3, THREE_CARDS_MIN_REM],
  [2, TABLET_MIN_REM],
];

export function useGridColumns(): GridColumns {
  const four = useMediaQuery(FOUR_CARDS_QUERY);
  const three = useMediaQuery(THREE_CARDS_QUERY);
  const tablet = useMediaQuery(TABLET_QUERY);
  const reached = new Map([
    [FOUR_CARDS_MIN_REM, four],
    [THREE_CARDS_MIN_REM, three],
    [TABLET_MIN_REM, tablet],
  ]);

  return columnsWhere((rem) => reached.get(rem) === true);
}

/** The columns of cards the window has now, read once, for what starts before React renders. */
export function currentGridColumns(): GridColumns {
  return columnsWhere((rem) => window.matchMedia(minWidthQuery(rem)).matches);
}

/**
 * The columns of cards of a window this many pixels wide, at the default font size: the same
 * steps as the screen, for a test that sets a width and needs the columns it gets.
 */
export function gridColumnsFor(widthPx: number): GridColumns {
  return columnsWhere((rem) => widthPx >= rem * ROOT_FONT_PX);
}

function columnsWhere(reaches: (minRem: number) => boolean): GridColumns {
  return STEPS.find(([, rem]) => reaches(rem))?.[0] ?? 1;
}
