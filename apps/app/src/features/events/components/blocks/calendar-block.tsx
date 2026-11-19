import { useNavigate, useSearch } from "@tanstack/react-router";
import { CalendarDaysIcon } from "lucide-react";
import { Route as ProtectedRoute } from "../../../../router/_protected";
import { ScreenTour } from "../../../../shared/tour/screen-tour";
import type { CalendarPlace } from "../../calendar";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { CalendarBoard } from "../calendar/calendar-board";
import { BlockPanel } from "./block-panel";

const HOME_ROUTE = "/_protected/_shell/";

function CalendarBlock({ family, childId, now, briefingShown, title }: HomeBlockProps) {
  const { user } = ProtectedRoute.useRouteContext();
  const search = useSearch({ from: HOME_ROUTE });
  const navigate = useNavigate({ from: "/" });

  const changePlace = (next: CalendarPlace) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  return (
    <BlockPanel title={title} icon={CalendarDaysIcon} fit="natural">
      <CalendarBoard
        family={family}
        childId={childId}
        place={{ view: search.view, date: search.date }}
        onPlaceChange={changePlace}
        now={now}
        briefingShown={briefingShown}
        tour={!search.event && <ScreenTour screen="home" userId={user.id} />}
      />
    </BlockPanel>
  );
}

export const calendarBlock: HomeBlockDefinition = {
  id: "calendar",
  titleKey: "blocks.calendar.title",
  descriptionKey: "blocks.calendar.description",
  icon: CalendarDaysIcon,
  sizes: { w: [6, 8, 12], h: [2, 3] },
  defaultSize: { w: 8, h: 3 },
  Component: CalendarBlock,
};
