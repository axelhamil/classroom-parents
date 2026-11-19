import { createContext, useContext, useLayoutEffect } from "react";

type ReportCompact = (compact: boolean) => void;

export const CompactTileContext = createContext<ReportCompact>(() => undefined);

/**
 * A block says it has nothing more than a line to show, so the home can lift
 * it out of the grid into the band above. Reported before paint: the move
 * never shows as a jump. A block still loading reports false and keeps its
 * cell.
 */
export function useCompactTile(compact: boolean): void {
  const report = useContext(CompactTileContext);

  useLayoutEffect(() => report(compact), [report, compact]);
}
