import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import type { BlockShape } from "./dashboard-layout";

export interface BlockIdentity {
  blockId: string;
  title: string;
}

/** A block as the grid draws it: its shape, its words already translated, and what it renders. */
export interface DashboardBlock<Context> extends BlockShape {
  title: string;
  description: string;
  icon: LucideIcon;
  Component: ComponentType<Context & BlockIdentity>;
}
