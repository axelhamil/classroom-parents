import { Button } from "@packages/ui/components/ui/button";
import { DateTab } from "@packages/ui/components/ui/date-tab";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { type ChildDto, childrenQueryOptions } from "../../shared/api/queries/children";
import { eventPagesQueryOptions } from "../../shared/api/queries/events";
import { EmptyState } from "../../shared/events/empty-state";
import { EventFilterBar } from "../../shared/events/event-filter-bar";
import {
  type EventFiltersSearch,
  eventFiltersSearchSchema,
  filtersFromSearch,
} from "../../shared/events/event-filters.schema";
import { childLabelsOf, EventList } from "../../shared/events/event-list";
import { wallDateParts } from "../../shared/format/deadline-label";
import { schoolToday } from "../../shared/format/school-today";
import { Screen } from "../../shared/layout/screen";
import { reviewEventsQueryOptions } from "./api/events.queries";
import { BlockedChildrenNotice } from "./components/blocked-children-notice";
import { ReviewCard } from "./components/review-card";

export const Route = createFileRoute("/_protected/_shell/")({
  validateSearch: eventFiltersSearchSchema,
  component: EventsPage,
});

function isFirstSyncRunning(children: readonly ChildDto[]): boolean {
  return children.some(
    (child) => child.syncing || (child.status === "connected" && !child.lastSyncedAt),
  );
}

function EventsPage() {
  const { t } = useTranslation("events");
  const now = new Date();
  const today = wallDateParts(schoolToday(now));

  return (
    <Screen
      title={t("list.title")}
      aside={
        <DateTab
          dateTime={schoolToday(now)}
          day={today.day}
          month={today.month}
          weekday={today.weekday}
          aria-label={t("list.today")}
        />
      }
    >
      <EventsBoard now={now} />
    </Screen>
  );
}

interface EventsBoardProps {
  now: Date;
}

function EventsBoard({ now }: EventsBoardProps) {
  const { t } = useTranslation("events");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const filters = filtersFromSearch(search);
  const children = useQuery(childrenQueryOptions);
  const events = useInfiniteQuery(eventPagesQueryOptions("upcoming", filters));
  const review = useQuery(reviewEventsQueryOptions(filters));

  const setSearch = (next: Partial<EventFiltersSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  if (children.isError || events.isError) {
    return (
      <LoadErrorAlert
        message={t("list.loadError")}
        retry={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void children.refetch();
              void events.refetch();
            }}
          >
            {t("list.retry")}
          </Button>
        }
      />
    );
  }

  if (children.isPending || events.isPending) {
    return (
      <SkeletonGroup label={t("list.loading")} className="gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </SkeletonGroup>
    );
  }

  if (children.data.length === 0) {
    return (
      <EmptyState
        title={t("empty.noChild.title")}
        description={t("empty.noChild.description")}
        action={
          <Button asChild size="sm">
            <Link to="/children/new">{t("empty.noChild.action")}</Link>
          </Button>
        }
      />
    );
  }

  const items = events.data.pages.flatMap((page) => page.items);
  const toReview = review.data ?? [];
  const childLabels = childLabelsOf(children.data);
  const filtered = filters.category !== null || filters.childId !== null;

  return (
    <div className="flex flex-col gap-4">
      <BlockedChildrenNotice childrenList={children.data} />
      <EventFilterBar childrenList={children.data} filters={filters} onChange={setSearch} />
      {toReview.length > 0 && <ReviewCard events={toReview} now={now} />}
      {items.length > 0 ? (
        <EventList events={items} childLabels={childLabels} now={now} muted={false} />
      ) : filtered ? (
        <EmptyState
          title={t("empty.filtered.title")}
          description={t("empty.filtered.description")}
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/" search={{}}>
                {t("empty.filtered.action")}
              </Link>
            </Button>
          }
        />
      ) : isFirstSyncRunning(children.data) ? (
        <EmptyState title={t("empty.syncing.title")} description={t("empty.syncing.description")} />
      ) : (
        <EmptyState title={t("empty.nothing.title")} description={t("empty.nothing.description")} />
      )}
      {events.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          disabled={events.isFetchingNextPage}
          onClick={() => void events.fetchNextPage()}
        >
          {t("list.more")}
        </Button>
      )}
    </div>
  );
}
