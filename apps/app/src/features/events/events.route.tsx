import { Button } from "@packages/ui/components/ui/button";
import { DateTab } from "@packages/ui/components/ui/date-tab";
import { userStorageKey, useStoredValue } from "@packages/web-kit/storage/use-stored-value";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeftIcon, UsersRoundIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { type ChildDto, childrenQueryOptions } from "../../shared/api/queries/children";
import { redirectToOnboardingWithoutChild } from "../../shared/children/redirect-to-onboarding";
import { CategoryFilter } from "../../shared/events/category-filter";
import { BoardEmpty, EventBoard, EventBoardSkeleton } from "../../shared/events/event-board";
import { childHue, childLabelOf } from "../../shared/format/child-hue";
import { wallDateParts } from "../../shared/format/deadline-label";
import { schoolToday } from "../../shared/format/school-today";
import { Screen } from "../../shared/layout/screen";
import { QueryState } from "../../shared/query/query-state";
import { ScreenTour } from "../../shared/tour/screen-tour";
import { reviewEventsQueryOptions } from "./api/events.queries";
import { BlockedChildrenNotice } from "./components/blocked-children-notice";
import { CalendarBoard, type CalendarPlace } from "./components/calendar/calendar-board";
import { EventOverlay } from "./components/event-overlay";
import { NextSchoolBriefing } from "./components/next-school-briefing";
import { ReviewCard } from "./components/review-card";
import { type HomeSearch, homeSearchSchema } from "./events.schema";
import { useCelebrateProgress } from "./hooks/use-celebrate-progress";
import { useNow } from "./hooks/use-now";
import { firstNameOf, greetingKind } from "./week";

export const Route = createFileRoute("/_protected/_shell/")({
  validateSearch: homeSearchSchema,
  beforeLoad: redirectToOnboardingWithoutChild,
  component: HomePage,
});

const SELECTED_CHILD_SCHEMA = z.string().nullable();

function HomePage() {
  const { t } = useTranslation("events");
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const router = useRouter();
  const now = useNow();
  const today = schoolToday(now);
  const todayParts = wallDateParts(today);
  const name = firstNameOf(user.name);
  const greeting =
    greetingKind(now) === "evening"
      ? t("home.greeting.evening", { name })
      : t("home.greeting.morning", { name });

  return (
    <Screen
      width="wide"
      title={name ? greeting : t("list.title")}
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
      skeleton={<EventBoardSkeleton label={t("calendar.loading")} />}
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
  const review = useQuery(reviewEventsQueryOptions({ category: null, childId }));
  const toReview = review.data ?? [];
  useCelebrateProgress(now);

  const setSearch = (next: Partial<HomeSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  const selectChild = (next: string | null) => {
    setStored(next);
    setSearch({ childId: next ?? undefined });
  };

  const place: CalendarPlace = { view: search.view, date: search.date };

  if (search.tab === "history")
    return (
      <div className="flex flex-col gap-4">
        <Button asChild variant="ghost" className="self-start">
          <Link to="/" search={{ view: search.view, date: search.date }}>
            <ArrowLeftIcon aria-hidden />
            {t("calendar.backToCalendar")}
          </Link>
        </Button>
        <CategoryFilter
          value={search.category ?? null}
          onChange={(category) => setSearch({ category })}
        />
        <EventBoard
          scope="history"
          filters={{ category: search.category ?? null, childId }}
          family={family}
          onResetFilters={() => {
            setStored(null);
            setSearch({ category: undefined, childId: undefined });
          }}
        />
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      <BlockedChildrenNotice childrenList={family} />
      <NextSchoolBriefing family={family} childId={childId} now={now} />
      <CalendarBoard
        family={family}
        childId={childId}
        onChildChange={selectChild}
        place={place}
        onPlaceChange={setSearch}
        now={now}
        tour={!search.event && <ScreenTour screen="home" userId={user.id} />}
      />
      {toReview.length > 0 && (
        <ReviewCard
          events={toReview}
          childLabel={(id) => childLabelOf(family, id)}
          childColor={(id) => childHue(family, id)}
        />
      )}
    </div>
  );
}
