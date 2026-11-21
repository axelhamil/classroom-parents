import type { Icon } from "@packages/ui/components/ui/icons";
import type { ComponentType } from "react";
import type { BlockSizing } from "./block-size";

export interface BlockIdentity {
  blockId: string;
  title: string;
}

export interface FullViewProps {
  title: string;
  onClose: () => void;
  returnFocus: () => HTMLElement[];
}

/**
 * A block as the grid draws it: its bounds and the size it is shown at, its words already translated, and what it
 * renders. `fullView` opens what the tile cannot hold whole, behind "Tout voir". `flowsOnPhone`
 * lets the block take the height of its content on a phone, where it scrolls with the page.
 * `tour` names the guided-tour step anchored on its tile, so a hidden block takes its step along.
 */
export interface DashboardBlock<Context> {
  id: string;
  sizing: BlockSizing;
  title: string;
  description: string;
  icon: Icon;
  tour?: string;
  flowsOnPhone?: boolean;
  fullView?: ComponentType<Context & FullViewProps>;
  Component: ComponentType<Context & BlockIdentity>;
}
