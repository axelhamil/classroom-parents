import { SunIcon } from "lucide-react";
import type { HomeBlockDefinition } from "../../home-block";
import { NextSchoolBriefing } from "../next-school-briefing";

export const todayBlock: HomeBlockDefinition = {
  id: "today",
  titleKey: "blocks.today.title",
  descriptionKey: "blocks.today.description",
  icon: SunIcon,
  sizes: { w: [3, 4, 6, 8], h: [2, 3] },
  defaultSize: { w: 4, h: 2 },
  Component: NextSchoolBriefing,
};
