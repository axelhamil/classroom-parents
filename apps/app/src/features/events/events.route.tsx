import { Button } from "@packages/ui/components/ui/button";
import { DateTab } from "@packages/ui/components/ui/date-tab";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { UsersRoundIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { childrenQueryOptions } from "../../shared/api/queries/children";
import { BoardEmpty, EventBoard, EventBoardSkeleton } from "../../shared/events/event-board";
import { EventFilterBar } from "../../shared/events/event-filter-bar";
import {
  type EventFiltersSearch,
  eventFiltersSearchSchema,
  filtersFromSearch,
} from "../../shared/events/event-filters.schema";
import { childHue, childLabelOf } from "../../shared/format/child-hue";
import { wallDateParts } from "../../shared/format/deadline-label";
import { schoolToday } from "../../shared/format/school-today";
import { Screen } from "../../shared/layout/screen";
import { QueryState } from "../../shared/query/query-state";
import { reviewEventsQueryOptions } from "./api/events.queries";
import { BlockedChildrenNotice } from "./components/blocked-children-notice";
import { ReviewCard } from "./components/review-card";

export const Route = createFileRoute("/_protected/_shell/")({
  validateSearch: eventFiltersSearchSchema,
  component: EventsPage,
});

function EventsPage() {
  const { t } = useTranslation("events");
  const now = new Date();
  const today = wallDateParts(schoolToday(now));

  return (
    <Screen
      title={t("list.title")}
      actions={
        <DateTab
          dateTime={schoolToday(now)}
          day={today.day}
          month={today.month}
          weekday={today.weekday}
          aria-label={t("list.today")}
        />
      }
    >
      <EventsBoard />
    </Screen>
  );
}

function EventsBoard() {
  const { t } = useTranslation("events");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const filters = filtersFromSearch(search);
  const children = useQuery(childrenQueryOptions);
  const review = useQuery(reviewEventsQueryOptions(filters));

  const setSearch = (next: Partial<EventFiltersSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

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
      {(family) => {
        const childColor = (childId: string) => childHue(family, childId);
        const toReview = review.data ?? [];

        return (
          <div className="flex flex-col gap-4">
            <BlockedChildrenNotice childrenList={family} />
            <EventFilterBar childrenList={family} filters={filters} onChange={setSearch} />
            {toReview.length > 0 && (
              <ReviewCard
                events={toReview}
                childLabel={(childId) => childLabelOf(family, childId)}
                childColor={childColor}
              />
            )}
            <EventBoard scope="upcoming" filters={filters} childColor={childColor} />
          </div>
        );
      }}
    </QueryState>
  );
}
