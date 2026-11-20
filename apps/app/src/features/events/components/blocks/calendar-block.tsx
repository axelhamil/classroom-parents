import { useNavigate, useSearch } from "@tanstack/react-router";
import { CalendarDaysIcon } from "lucide-react";
import type { CalendarPlace } from "../../calendar";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { CalendarBoard } from "../calendar/calendar-board";
import { BlockPanel } from "./block-panel";

const HOME_ROUTE = "/_protected/_shell/";

function CalendarBlock({
  family,
  childId,
  clock,
  briefingShown,
  overdueShown,
  title,
}: HomeBlockProps) {
  const search = useSearch({ from: HOME_ROUTE });
  const navigate = useNavigate({ from: "/" });

  const changePlace = (next: CalendarPlace) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  return (
    <BlockPanel title={title} icon={CalendarDaysIcon} fit="natural" startAt={clock.today}>
      <CalendarBoard
        family={family}
        childId={childId}
        place={{ view: search.view, date: search.date }}
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
  icon: CalendarDaysIcon,
  tour: "home-week",
  flowsOnPhone: true,
  Component: CalendarBlock,
};
