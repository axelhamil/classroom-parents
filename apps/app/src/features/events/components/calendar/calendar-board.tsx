import { CalendarPeriod } from "@packages/ui/components/ui/calendar-day";
import { Tabs, TabsContent } from "@packages/ui/components/ui/tabs";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { HourglassIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../../shared/api/queries/children";
import type { EventItem } from "../../../../shared/api/queries/events";
import {
  BoardEmpty,
  EventBoardSkeleton,
  isFirstSyncRunning,
} from "../../../../shared/events/event-board";
import { schoolToday } from "../../../../shared/format/school-today";
import { QueryState } from "../../../../shared/query/query-state";
import { calendarEventsQueryOptions } from "../../api/events.queries";
import {
  CALENDAR_VIEWS,
  type CalendarView,
  calendarPeriod,
  daysOf,
  periodHolds,
  shiftAnchor,
} from "../../calendar";
import { useShareDays } from "../../hooks/use-share-days";
import { type SwipeStep, useSwipe } from "../../hooks/use-swipe";
import { schoolMoment } from "../../week";
import { FamilyRow } from "../family-row";
import { AddEventDialog } from "./add-event-dialog";
import { CalendarFeedDialog } from "./calendar-feed-dialog";
import { CalendarToolbar } from "./calendar-toolbar";
import { MonthView } from "./month-view";
import { OverdueButton } from "./overdue-button";
import { PeriodEmpty } from "./period-empty";
import { WeekStrip } from "./week-strip";
import { WeekView } from "./week-view";

export interface CalendarPlace {
  view?: CalendarView;
  date?: string;
}

export interface CalendarBoardProps {
  family: readonly ChildDto[];
  childId: string | null;
  onChildChange: (childId: string | null) => void;
  place: CalendarPlace;
  onPlaceChange: (place: CalendarPlace) => void;
  now: Date;
  briefing: ReactNode;
  tour: ReactNode;
}

type Direction = "none" | "forward" | "back";

function countByChild(events: readonly EventItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.childId, (counts.get(event.childId) ?? 0) + 1);

  return counts;
}

function useNeighbourPrefetch(view: CalendarView, anchor: string): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    for (const step of [1, -1] as const)
      void queryClient.prefetchQuery(
        calendarEventsQueryOptions(calendarPeriod(view, shiftAnchor(view, anchor, step))),
      );
  }, [queryClient, view, anchor]);
}

export function CalendarBoard({
  family,
  childId,
  onChildChange,
  place,
  onPlaceChange,
  now,
  briefing,
  tour,
}: CalendarBoardProps) {
  const { t } = useTranslation("events");
  const view = place.view ?? "week";
  const today = schoolToday(now);
  const anchor = place.date ?? today;
  const period = calendarPeriod(view, anchor);
  const query = useQuery({
    ...calendarEventsQueryOptions(period),
    placeholderData: keepPreviousData,
  });
  useNeighbourPrefetch(view, anchor);
  const [motion, setMotion] = useState<{ direction: Direction; turn: number }>({
    direction: "none",
    turn: 0,
  });
  const [adding, setAdding] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const shareDays = useShareDays(family, now);
  const loaded = query.data ?? [];
  const shown = childId ? loaded.filter((event) => event.childId === childId) : loaded;
  const days = daysOf(period, shown);

  const select = (date: string) => onPlaceChange({ date: date === today ? undefined : date });

  const turnTo = (date: string) => {
    setMotion((current) => ({
      direction: date > anchor ? "forward" : "back",
      turn: current.turn + 1,
    }));
    select(date);
  };

  const step = (direction: SwipeStep) => turnTo(shiftAnchor(view, anchor, direction));
  const swipe = useSwipe(step);

  const changeView = (next: string) => {
    const picked = CALENDAR_VIEWS.find((candidate) => candidate === next);
    if (!picked) return;

    setMotion((current) => ({ direction: "none", turn: current.turn + 1 }));
    onPlaceChange({ view: picked });
  };

  const viewProps = { days, family, now, today, onAdd: setAdding };
  const periodEmpty =
    shown.length === 0 ? (
      <PeriodEmpty
        family={family}
        childId={childId}
        now={now}
        onAdd={() => setAdding(anchor)}
        onGoTo={turnTo}
      />
    ) : null;

  return (
    <Tabs value={view} onValueChange={changeView} className="gap-4">
      {family.length > 1 && (
        <FamilyRow
          family={family}
          counts={countByChild(loaded)}
          value={childId}
          onChange={onChildChange}
        />
      )}
      {view === "week" && shown.length > 0 && (
        <WeekStrip days={days} family={family} now={now} today={today} />
      )}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[var(--spacing-briefing-panel)_minmax(0,1fr)] md:items-start md:gap-6">
        {briefing}
        <div className="@container flex min-w-0 flex-col gap-4">
          <CalendarToolbar
            view={view}
            anchor={anchor}
            period={period}
            todayInView={periodHolds(view, anchor, today)}
            onStep={step}
            onToday={() => turnTo(today)}
            onAdd={() => setAdding(anchor)}
            onShare={() => shareDays(days)}
            onSubscribe={() => setSubscribing(true)}
          />
          <OverdueButton
            family={family}
            childId={childId}
            now={now}
            today={today}
            before={period.from}
          />
          {CALENDAR_VIEWS.map((candidate) => (
            <TabsContent key={candidate} value={candidate}>
              <QueryState
                query={query}
                skeleton={<EventBoardSkeleton label={t("calendar.loading")} />}
              >
                {() =>
                  loaded.length === 0 && isFirstSyncRunning(family) ? (
                    <BoardEmpty
                      icon={HourglassIcon}
                      title={t("empty.syncing.title")}
                      description={t("empty.syncing.description")}
                    />
                  ) : (
                    <CalendarPeriod
                      key={`${candidate}:${motion.turn}`}
                      direction={motion.direction}
                      data-tour="home-week"
                      {...swipe}
                    >
                      {candidate === "week" &&
                        (periodEmpty ?? <WeekView {...viewProps} briefed={schoolMoment(now)} />)}
                      {candidate === "month" && (
                        <MonthView
                          {...viewProps}
                          anchor={anchor}
                          onSelect={select}
                          emptyPeriod={periodEmpty}
                        />
                      )}
                    </CalendarPeriod>
                  )
                }
              </QueryState>
            </TabsContent>
          ))}
        </div>
      </div>
      <AddEventDialog
        date={adding}
        family={family}
        childId={childId ?? family[0]?.id ?? ""}
        onClose={() => setAdding(null)}
      />
      <CalendarFeedDialog open={subscribing} onOpenChange={setSubscribing} />
      {query.isSuccess && tour}
    </Tabs>
  );
}
