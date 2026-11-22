import { CalendarIcon } from "@packages/ui/components/ui/icons";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { heroAgendaOpensOn, weekHeroDay, weekLoadView } from "../../../../shared/agenda/views";
import { useTileFrame } from "../../../../shared/dashboard/tile-frame";
import type { CalendarPlace } from "../../calendar";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { useHeroSummary } from "../../hooks/use-hero-summary";
import { useHomeEvents } from "../../hooks/use-home-events";
import { CalendarBoard } from "../calendar/calendar-board";
import { BlockPanel, heroDateOf } from "./block-panel";

const HOME_ROUTE = "/_protected/_shell/";

function CalendarBlock({
  family,
  childId,
  clock,
  briefingShown,
  overdueShown,
  advice,
  title,
}: HomeBlockProps) {
  const search = useSearch({ from: HOME_ROUTE });
  const navigate = useNavigate({ from: "/" });
  const events = useHomeEvents(clock).data ?? [];
  const holidayEndsOn =
    advice?.context.holiday === "during" ? (advice.holiday?.endsOn ?? null) : null;
  const summary = useHeroSummary(
    { advice, family, clock, childId },
    events,
    weekLoadView(events, clock, childId).open,
  );

  const opensOn = useTileFrame().hero ? heroAgendaOpensOn(clock, holidayEndsOn) : undefined;

  const changePlace = (next: CalendarPlace) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  return (
    <BlockPanel
      title={title}
      icon={CalendarIcon}
      fit="natural"
      startAt={clock.today}
      scrollsInside
      heroDate={heroDateOf(weekHeroDay(clock, holidayEndsOn))}
      summary={summary}
    >
      <CalendarBoard
        family={family}
        childId={childId}
        place={{ view: search.view, date: search.date, courseId: search.courseId }}
        onPlaceChange={changePlace}
        briefingShown={briefingShown}
        overdueShown={overdueShown}
        opensOn={opensOn}
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
  flowsOnPhone: true,
  Component: CalendarBlock,
};
