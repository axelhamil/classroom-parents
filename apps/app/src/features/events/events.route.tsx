import { Button } from "@packages/ui/components/ui/button";
import { DateTab } from "@packages/ui/components/ui/date-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@packages/ui/components/ui/tabs";
import { userStorageKey, useStoredValue } from "@packages/web-kit/storage/use-stored-value";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { HourglassIcon, UsersRoundIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { type ChildDto, childrenQueryOptions } from "../../shared/api/queries/children";
import type { EventItem, EventScope } from "../../shared/api/queries/events";
import { redirectToOnboardingWithoutChild } from "../../shared/children/redirect-to-onboarding";
import { CategoryFilter } from "../../shared/events/category-filter";
import {
  BoardEmpty,
  EventBoard,
  EventBoardSkeleton,
  isFirstSyncRunning,
} from "../../shared/events/event-board";
import { childHue, childLabelOf } from "../../shared/format/child-hue";
import { countdownOf, wallDateParts } from "../../shared/format/deadline-label";
import { schoolToday } from "../../shared/format/school-today";
import { Screen } from "../../shared/layout/screen";
import { QueryState } from "../../shared/query/query-state";
import { reviewEventsQueryOptions } from "./api/events.queries";
import { BlockedChildrenNotice } from "./components/blocked-children-notice";
import { EventOverlay } from "./components/event-overlay";
import { FamilyRow } from "./components/family-row";
import { PrintWeekButton } from "./components/print-week-button";
import { ReviewCard } from "./components/review-card";
import { SundayPanel } from "./components/sunday-panel";
import { TonightCard } from "./components/tonight-card";
import { WeekShareButton } from "./components/week-share-button";
import { WeekView } from "./components/week-view";
import { HOME_TABS, type HomeSearch, type HomeTab, homeSearchSchema } from "./events.schema";
import { useNow } from "./hooks/use-now";
import { useWeekEvents } from "./hooks/use-week-events";
import {
  firstNameOf,
  greetingKind,
  isEvening,
  isInWeek,
  isSundayEvening,
  weekDates,
  weekOf,
} from "./week";

export const Route = createFileRoute("/_protected/_shell/")({
  validateSearch: homeSearchSchema,
  beforeLoad: redirectToOnboardingWithoutChild,
  component: HomePage,
});

const SELECTED_CHILD_SCHEMA = z.string().nullable();

const BOARD_SCOPES = ["upcoming", "history"] as const satisfies readonly EventScope[];

function HomePage() {
  const { t } = useTranslation("events");
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const router = useRouter();
  const now = useNow();
  const today = schoolToday(now);
  const todayParts = wallDateParts(today);
  const dates = weekDates(now);
  const from = wallDateParts(dates[0] ?? today);
  const to = wallDateParts(dates.at(-1) ?? today);
  const name = firstNameOf(user.name);
  const greeting =
    greetingKind(now) === "evening"
      ? t("home.greeting.evening", { name })
      : t("home.greeting.morning", { name });

  return (
    <Screen
      width="wide"
      title={name ? greeting : t("list.title")}
      description={t("home.weekRange", {
        from: `${from.day} ${from.month}`,
        to: `${to.day} ${to.month}`,
      })}
      actions={
        <DateTab
          dateTime={today}
          tone="today"
          day={todayParts.day}
          month={todayParts.month}
          weekday={todayParts.weekday}
          aria-label={t("list.today")}
        />
      }
    >
      <HomeBoard now={now} />
      {search.event && (
        <EventOverlay eventId={search.event} onClose={() => router.history.back()} />
      )}
    </Screen>
  );
}

interface HomeBoardProps {
  now: Date;
}

function HomeBoard({ now }: HomeBoardProps) {
  const { t } = useTranslation("events");
  const children = useQuery(childrenQueryOptions);

  return (
    <QueryState
      query={children}
      skeleton={<EventBoardSkeleton label={t("list.loading")} />}
      empty={
        <BoardEmpty
          icon={UsersRoundIcon}
          title={t("empty.noChild.title")}
          description={t("empty.noChild.description")}
          action={
            <Button asChild size="sm">
              <Link to="/children/new">{t("empty.noChild.action")}</Link>
            </Button>
          }
        />
      }
      isEmpty={(family) => family.length === 0}
    >
      {(family) => <FamilyHome family={family} now={now} />}
    </QueryState>
  );
}

interface FamilyHomeProps {
  family: readonly ChildDto[];
  now: Date;
}

function countByChild(events: readonly EventItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.childId, (counts.get(event.childId) ?? 0) + 1);

  return counts;
}

function FamilyHome({ family, now }: FamilyHomeProps) {
  const { t } = useTranslation("events");
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [stored, setStored] = useStoredValue(
    userStorageKey(user.id, "family:child"),
    SELECTED_CHILD_SCHEMA,
    null,
  );
  const requested = search.childId ?? stored;
  const childId = family.some((child) => child.id === requested) ? requested : null;
  const filters = { category: search.category ?? null, childId };
  const tab = search.tab ?? "week";
  const review = useQuery(
    reviewEventsQueryOptions(tab === "week" ? { category: null, childId } : filters),
  );
  const week = useWeekEvents(weekDates(now).at(-1) ?? schoolToday(now));
  const weekEvents = (week.data?.pages.flatMap((page) => page.items) ?? []).filter((event) =>
    isInWeek(event.deadlineDate, now),
  );
  const shown = childId ? weekEvents.filter((event) => event.childId === childId) : weekEvents;
  const days = weekOf(shown, now);
  const toReview = review.data ?? [];

  const setSearch = (next: Partial<HomeSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  const selectChild = (next: string | null) => {
    setStored(next);
    setSearch({ childId: undefined });
  };

  const selectTab = (value: string) => {
    const next = HOME_TABS.find((candidate): candidate is HomeTab => candidate === value);
    setSearch({ tab: next === "week" ? undefined : next });
  };

  const tonight = isEvening(now)
    ? [
        ...(days[0]?.events.filter(
          (event) => countdownOf(event.deadlineDate, event.deadlineTime, now) !== null,
        ) ?? []),
        ...(days[1]?.events ?? []),
      ]
    : [];

  const reviewCard = toReview.length > 0 && (
    <ReviewCard
      events={toReview}
      childLabel={(id) => childLabelOf(family, id)}
      childColor={(id) => childHue(family, id)}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <BlockedChildrenNotice childrenList={family} />
      {family.length > 1 && (
        <FamilyRow
          family={family}
          weekCounts={countByChild(weekEvents)}
          value={childId}
          onChange={selectChild}
        />
      )}
      <Tabs value={tab} onValueChange={selectTab} className="gap-6">
        <TabsList size="touch" aria-label={t("home.tabs.label")} className="w-full @md:w-fit">
          <TabsTrigger value="week">{t("home.tabs.week")}</TabsTrigger>
          <TabsTrigger value="upcoming">{t("home.tabs.upcoming")}</TabsTrigger>
          <TabsTrigger value="history">{t("home.tabs.history")}</TabsTrigger>
        </TabsList>
        <TabsContent value="week" className="flex flex-col gap-6">
          <QueryState query={week} skeleton={<EventBoardSkeleton label={t("list.loading")} />}>
            {() => (
              <>
                {isSundayEvening(now) ? (
                  <SundayPanel days={days} family={family} now={now} />
                ) : (
                  <>
                    {tonight.length > 0 && <TonightCard events={tonight} family={family} />}
                    <div className="flex flex-wrap justify-end gap-2">
                      <PrintWeekButton />
                      <WeekShareButton days={days} family={family} now={now} />
                    </div>
                  </>
                )}
                {weekEvents.length === 0 && isFirstSyncRunning(family) ? (
                  <BoardEmpty
                    icon={HourglassIcon}
                    title={t("empty.syncing.title")}
                    description={t("empty.syncing.description")}
                  />
                ) : (
                  <WeekView days={days} family={family} now={now} />
                )}
                {reviewCard}
              </>
            )}
          </QueryState>
        </TabsContent>
        {BOARD_SCOPES.map((scope) => (
          <TabsContent key={scope} value={scope} className="flex flex-col gap-4">
            {scope === "upcoming" && reviewCard}
            <CategoryFilter
              value={filters.category}
              onChange={(category) => setSearch({ category })}
            />
            <EventBoard
              scope={scope}
              filters={filters}
              family={family}
              onResetFilters={() => {
                setStored(null);
                setSearch({ category: undefined, childId: undefined });
              }}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
