import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import type { BlockShape } from "./dashboard-layout";

export interface BlockIdentity {
  blockId: string;
  title: string;
  rows: number;
}

/**
 * A block as the grid draws it: its shape, its words already translated, and
 * what it renders. `tour` names the guided-tour step anchored on its tile, so
 * a hidden block takes its step along.
 */
export interface DashboardBlock<Context> extends BlockShape {
  title: string;
  description: string;
  icon: LucideIcon;
  tour?: string;
  Component: ComponentType<Context & BlockIdentity>;
}
