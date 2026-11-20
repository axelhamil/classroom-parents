import { createContext, type ReactNode, useContext } from "react";
import type { BlockSize } from "./dashboard-pack";

/**
 * What the grid tells the frame of a block about its tile: its size, whether the home is being
 * arranged (the content then goes inert and `controls` join the header), whether it flows with the
 * page instead of scrolling inside, and the footer leading to its full view.
 */
export interface TileFrame {
  size: BlockSize;
  editing: boolean;
  flows: boolean;
  controls: ReactNode;
  footer: ReactNode;
}

const READING: TileFrame = {
  size: "m",
  editing: false,
  flows: false,
  controls: null,
  footer: null,
};

export const TileFrameContext = createContext<TileFrame>(READING);

export function useTileFrame(): TileFrame {
  return useContext(TileFrameContext);
}
