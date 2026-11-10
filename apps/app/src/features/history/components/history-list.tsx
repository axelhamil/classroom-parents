import { Button } from "@packages/ui/components/ui/button";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { childrenQueryOptions } from "../../../shared/api/queries/children";
import { type EventFilters, eventPagesQueryOptions } from "../../../shared/api/queries/events";
import { EmptyState } from "../../../shared/events/empty-state";
import { EventFilterBar } from "../../../shared/events/event-filter-bar";
import type { EventFiltersSearch } from "../../../shared/events/event-filters.schema";
import { childLabelsOf, EventList } from "../../../shared/events/event-list";

export interface HistoryListProps {
  filters: EventFilters;
  onFiltersChange: (next: Partial<EventFiltersSearch>) => void;
}

export function HistoryList({ filters, onFiltersChange }: HistoryListProps) {
  const { t } = useTranslation("history");
  const { t: tEvents } = useTranslation("events");
  const children = useQuery(childrenQueryOptions);
  const events = useInfiniteQuery(eventPagesQueryOptions("history", filters));

  if (children.isError || events.isError) {
    return (
      <LoadErrorAlert
        message={tEvents("list.loadError")}
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
            {tEvents("list.retry")}
          </Button>
        }
      />
    );
  }

  if (children.isPending || events.isPending) {
    return (
      <SkeletonGroup label={t("loading")} className="gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </SkeletonGroup>
    );
  }

  const items = events.data.pages.flatMap((page) => page.items);
  const filtered = filters.category !== null || filters.childId !== null;

  return (
    <div className="flex flex-col gap-4">
      <EventFilterBar childrenList={children.data} filters={filters} onChange={onFiltersChange} />
      {items.length > 0 ? (
        <EventList
          events={items}
          childLabels={childLabelsOf(children.data)}
          now={new Date()}
          muted
        />
      ) : filtered ? (
        <EmptyState
          title={t("filtered.title")}
          description={t("filtered.description")}
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/history" search={{}}>
                {t("filtered.action")}
              </Link>
            </Button>
          }
        />
      ) : (
        <EmptyState title={t("empty.title")} description={t("empty.description")} />
      )}
      {events.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          disabled={events.isFetchingNextPage}
          onClick={() => void events.fetchNextPage()}
        >
          {tEvents("list.more")}
        </Button>
      )}
    </div>
  );
}
