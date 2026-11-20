import { TodayIcon } from "@packages/ui/components/ui/icons";
import type { HomeBlockDefinition } from "../../home-block";
import { NextSchoolBriefing } from "../next-school-briefing";

export const todayBlock: HomeBlockDefinition = {
  id: "today",
  titleKey: "blocks.today.title",
  descriptionKey: "blocks.today.description",
  icon: TodayIcon,
  tour: "home-today",
  Component: NextSchoolBriefing,
};
