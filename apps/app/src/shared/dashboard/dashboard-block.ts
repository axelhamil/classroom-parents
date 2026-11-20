import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import type { BlockSize } from "./dashboard-pack";

export interface BlockIdentity {
  blockId: string;
  title: string;
  size: BlockSize;
}

export interface BlockSizeChoice {
  allowed: readonly BlockSize[];
  defaultSize: BlockSize;
}

export interface FullViewProps {
  title: string;
  onClose: () => void;
  returnFocus: () => HTMLElement[];
}

/**
 * A block as the grid draws it: the sizes it allows, its words already translated, and what it
 * renders. `fullView` opens what the tile cannot hold whole, behind "Tout voir". `flowsOnPhone`
 * lets the block take the height of its content on a phone, where it scrolls with the page.
 * `tour` names the guided-tour step anchored on its tile, so a hidden block takes its step along.
 */
export interface DashboardBlock<Context> {
  id: string;
  sizes: BlockSizeChoice;
  title: string;
  description: string;
  icon: LucideIcon;
  tour?: string;
  flowsOnPhone?: boolean;
  fullView?: ComponentType<Context & FullViewProps>;
  Component: ComponentType<Context & BlockIdentity>;
}
