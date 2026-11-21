import { createContext, type ReactElement, type ReactNode, useContext } from "react";
import type { BlockSize } from "./dashboard-pack";

/**
 * What the grid tells the frame of a block about its tile: its size, whether the home is being
 * arranged (the content then goes inert and `controls` join the header), whether it flows with the
 * page instead of scrolling inside, whether it is the hero the advice chose (it then wears the hero
 * look, its large date and its sentence), the footer leading to its full view, and what wraps the header
 * while the home is read (the menu a long press or a right click opens). `scroll` keeps where the
 * body was scrolled when the tile is drawn again by the other grid, entering or leaving the edit.
 */
export interface TileFrame {
  size: BlockSize;
  editing: boolean;
  flows: boolean;
  hero: boolean;
  controls: ReactNode;
  footer: ReactNode;
  wrapHeader?: (header: ReactElement) => ReactNode;
  scroll?: KeptScroll;
}

export interface KeptScroll {
  read: () => number | undefined;
  keep: (top: number) => void;
}

const READING: TileFrame = {
  size: "m",
  editing: false,
  flows: false,
  hero: false,
  controls: null,
  footer: null,
};

export const TileFrameContext = createContext<TileFrame>(READING);

export function useTileFrame(): TileFrame {
  return useContext(TileFrameContext);
}
