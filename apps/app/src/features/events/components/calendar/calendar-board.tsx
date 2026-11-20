import { CalendarPeriod } from "@packages/ui/components/ui/calendar-day";
import { Tabs, TabsContent } from "@packages/ui/components/ui/tabs";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { HourglassIcon } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSchoolClock } from "../../../../shared/agenda/school-clock-context";
import type { ChildDto } from "../../../../shared/api/queries/children";
import {
  BoardEmpty,
  EventBoardSkeleton,
  isFirstSyncRunning,
} from "../../../../shared/events/event-board";
import { preloadOverlayFrame } from "../../../../shared/layout/responsive-overlay";
import { usePrefetchWhenIdle } from "../../../../shared/perf/prefetch-when-idle";
import { preloadable } from "../../../../shared/perf/preloadable";
import { QueryState } from "../../../../shared/query/query-state";
import { calendarEventsQueryOptions } from "../../api/events.queries";
import {
  CALENDAR_VIEWS,
  type CalendarPlace,
  type CalendarView,
  calendarPeriod,
  daysOf,
  periodHolds,
  placePeriod,
  shiftAnchor,
} from "../../calendar";
import { useShareDays } from "../../hooks/use-share-days";
import { type SwipeStep, useSwipe } from "../../hooks/use-swipe";
import { AddEventDialog, preloadAddEventForm } from "./add-event-dialog";
import { CalendarFeedDialog } from "./calendar-feed-dialog";
import { CalendarToolbar } from "./calendar-toolbar";
import { OverdueButton } from "./overdue-button";
import { PeriodEmpty } from "./period-empty";
import { WeekStrip } from "./week-strip";
import { WeekView } from "./week-view";

export interface CalendarBoardProps {
  family: readonly ChildDto[];
  childId: string | null;
  place: CalendarPlace;
  onPlaceChange: (place: CalendarPlace) => void;
  briefingShown: boolean;
  overdueShown: boolean;
}

type Direction = "none" | "forward" | "back";

const { Component: MonthView, preload: preloadMonthView } = preloadable(() =>
  import("./month-view").then((module) => module.MonthView),
);

const OPENED_ON_DEMAND = [preloadOverlayFrame, preloadAddEventForm, preloadMonthView];

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
  place,
  onPlaceChange,
  briefingShown,
  overdueShown,
}: CalendarBoardProps) {
  const { t } = useTranslation("events");
  const clock = useSchoolClock();
  const { now } = clock;
  const { view, today, anchor, period } = placePeriod(place, clock);
  const query = useQuery({
    ...calendarEventsQueryOptions(period),
    placeholderData: keepPreviousData,
  });
  useNeighbourPrefetch(view, anchor);
  usePrefetchWhenIdle(OPENED_ON_DEMAND);
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
      {view === "week" && shown.length > 0 && (
        <WeekStrip days={days} family={family} now={now} today={today} />
      )}
      <div className="@container flex min-w-0 flex-col gap-4">
        {!overdueShown && <OverdueButton family={family} childId={childId} before={period.from} />}
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
                    {...swipe}
                  >
                    {candidate === "week" &&
                      (periodEmpty ?? (
                        <WeekView {...viewProps} briefed={briefingShown ? clock : null} />
                      ))}
                    {candidate === "month" && (
                      <Suspense fallback={<EventBoardSkeleton label={t("calendar.loading")} />}>
                        <MonthView
                          {...viewProps}
                          anchor={anchor}
                          onSelect={select}
                          emptyPeriod={periodEmpty}
                        />
                      </Suspense>
                    )}
                  </CalendarPeriod>
                )
              }
            </QueryState>
          </TabsContent>
        ))}
      </div>
      <AddEventDialog
        date={adding}
        family={family}
        childId={childId}
        onClose={() => setAdding(null)}
      />
      <CalendarFeedDialog open={subscribing} onOpenChange={setSubscribing} />
    </Tabs>
  );
}
