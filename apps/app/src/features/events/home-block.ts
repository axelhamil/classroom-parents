import type { ParseKeys } from "i18next";
import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import type { ChildDto } from "../../shared/api/queries/children";
import type { BlockIdentity } from "../../shared/dashboard/dashboard-block";
import type { BlockShape } from "../../shared/dashboard/dashboard-layout";

export interface HomeBlockContext {
  family: readonly ChildDto[];
  childId: string | null;
  now: Date;
  briefingShown: boolean;
}

export type HomeBlockProps = HomeBlockContext & BlockIdentity;

export interface HomeBlockDefinition extends BlockShape {
  titleKey: ParseKeys<"home">;
  descriptionKey: ParseKeys<"home">;
  icon: LucideIcon;
  Component: ComponentType<HomeBlockProps>;
}
