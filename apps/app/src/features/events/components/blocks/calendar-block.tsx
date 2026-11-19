import { CalendarIcon } from "@packages/ui/components/ui/icons";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { CalendarPlace } from "../../calendar";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { CalendarBoard } from "../calendar/calendar-board";
import { BlockPanel } from "./block-panel";

const HOME_ROUTE = "/_protected/_shell/";

function CalendarBlock({ family, childId, briefingShown, overdueShown, title }: HomeBlockProps) {
  const search = useSearch({ from: HOME_ROUTE });
  const navigate = useNavigate({ from: "/" });

  const changePlace = (next: CalendarPlace) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  return (
    <BlockPanel title={title} icon={CalendarIcon} fit="natural">
      <CalendarBoard
        family={family}
        childId={childId}
        place={{ view: search.view, date: search.date, courseId: search.courseId }}
        onPlaceChange={changePlace}
        briefingShown={briefingShown}
        overdueShown={overdueShown}
      />
    </BlockPanel>
  );
}

export const calendarBlock: HomeBlockDefinition = {
  id: "calendar",
  titleKey: "blocks.calendar.title",
  descriptionKey: "blocks.calendar.description",
  icon: CalendarIcon,
  tour: "home-week",
  sizes: { w: [6, 8, 12], h: [2, 3] },
  defaultSize: { w: 8, h: 3 },
  Component: CalendarBlock,
};
