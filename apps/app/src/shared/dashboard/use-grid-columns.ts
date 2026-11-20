import { TABLET_QUERY, useMediaQuery, WIDE_QUERY } from "../layout/use-media-query";

export type GridColumns = 4 | 8 | 12;

export function useGridColumns(): GridColumns {
  const wide = useMediaQuery(WIDE_QUERY);
  const tablet = useMediaQuery(TABLET_QUERY);
  if (wide) return 12;

  return tablet ? 8 : 4;
}
