import { Button } from "@packages/ui/components/ui/button";
import { DateTab } from "@packages/ui/components/ui/date-tab";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { type ChildDto, childrenQueryOptions } from "../../shared/api/queries/children";
import { wallDateParts } from "../../shared/format/deadline-label";
import { schoolToday } from "../../shared/format/school-today";
import { Screen } from "../../shared/layout/screen";
import {
  type EventFilters,
  reviewEventsQueryOptions,
  upcomingEventsQueryOptions,
} from "./api/events.queries";
import { BlockedChildrenNotice } from "./components/blocked-children-notice";
import { EmptyState } from "./components/empty-state";
import { EventList } from "./components/event-list";
import { FilterChips } from "./components/filter-chips";
import { ReviewCard } from "./components/review-card";
import { CATEGORY_LABEL_KEYS, EVENT_CATEGORIES } from "./event-labels";

const eventsSearchSchema = z.object({
  category: z.enum(EVENT_CATEGORIES).optional().catch(undefined),
  childId: z.uuid().optional().catch(undefined),
});

type EventsSearch = z.infer<typeof eventsSearchSchema>;

export const Route = createFileRoute("/_protected/_shell/")({
  validateSearch: eventsSearchSchema,
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
  const filters: EventFilters = {
    category: search.category ?? null,
    childId: search.childId ?? null,
  };
  const children = useQuery(childrenQueryOptions);
  const events = useInfiniteQuery(upcomingEventsQueryOptions(filters));
  const review = useQuery(reviewEventsQueryOptions(filters));

  const setSearch = (next: Partial<EventsSearch>) =>
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
  const childLabels =
    children.data.length > 1
      ? new Map(children.data.map((child) => [child.id, child.label] as const))
      : null;
  const filtered = filters.category !== null || filters.childId !== null;

  return (
    <div className="flex flex-col gap-4">
      <BlockedChildrenNotice childrenList={children.data} />
      {childLabels && (
        <FilterChips
          label={t("filters.child")}
          value={filters.childId}
          onChange={(childId) => setSearch({ childId: childId ?? undefined })}
          options={[
            { value: null, label: t("filters.allChildren") },
            ...children.data.map((child) => ({ value: child.id, label: child.label })),
          ]}
        />
      )}
      <FilterChips
        label={t("filters.category")}
        value={filters.category}
        onChange={(category) =>
          setSearch({ category: eventsSearchSchema.shape.category.parse(category ?? undefined) })
        }
        options={[
          { value: null, label: t("filters.allCategories") },
          ...EVENT_CATEGORIES.map((category) => ({
            value: category,
            label: t(CATEGORY_LABEL_KEYS[category]),
          })),
        ]}
      />
      {toReview.length > 0 && <ReviewCard events={toReview} now={now} />}
      {items.length > 0 ? (
        <EventList events={items} childLabels={childLabels} now={now} />
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
