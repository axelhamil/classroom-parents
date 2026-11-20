import type { Icon } from "@packages/ui/components/ui/icons";
import type { ParseKeys } from "i18next";
import type { ComponentType } from "react";
import type { SchoolClock } from "../../shared/agenda/school-clock";
import type { ChildDto } from "../../shared/api/queries/children";
import type { BlockIdentity, FullViewProps } from "../../shared/dashboard/dashboard-block";

export interface HomeBlockContext {
  family: readonly ChildDto[];
  childId: string | null;
  clock: SchoolClock;
  briefingShown: boolean;
  overdueShown: boolean;
}

export type HomeBlockProps = HomeBlockContext & BlockIdentity;

export type HomeFullViewProps = HomeBlockContext & FullViewProps;

export interface HomeBlockDefinition {
  id: string;
  titleKey: ParseKeys<"home">;
  descriptionKey: ParseKeys<"home">;
  /** The length of the window the block reads, written in its description. */
  windowDays?: number;
  icon: Icon;
  tour?: string;
  flowsOnPhone?: boolean;
  fullView?: ComponentType<HomeFullViewProps>;
  Component: ComponentType<HomeBlockProps>;
}
