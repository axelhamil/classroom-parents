import { Button } from "@packages/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@packages/ui/components/ui/empty";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArchiveIcon,
  CalendarCheckIcon,
  HourglassIcon,
  ListFilterIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../api/queries/children";
import { type EventFilters, type EventScope, eventPagesQueryOptions } from "../api/queries/events";
import { childHue, childLabelOf } from "../format/child-hue";
import { QueryState } from "../query/query-state";
import { EventList } from "./event-list";

export interface EventBoardSkeletonProps {
  label: string;
}

export function EventBoardSkeleton({ label }: EventBoardSkeletonProps) {
  return (
    <SkeletonGroup label={label} className="gap-3">
      <Skeleton shape="line" className="w-32" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton shape="line" className="w-40" />
      <Skeleton className="h-16 w-full" />
    </SkeletonGroup>
  );
}

export interface BoardEmptyProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export function BoardEmpty({ icon: Icon, title, description, action }: BoardEmptyProps) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="scene">
          <Icon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

export function isFirstSyncRunning(children: readonly ChildDto[]): boolean {
  return children.some(
    (child) => child.syncing || (child.status === "connected" && !child.lastSyncedAt),
  );
}

interface ScopeEmptyProps {
  scope: EventScope;
  filtered: boolean;
  family: readonly ChildDto[];
  onResetFilters: () => void;
}

function ScopeEmpty({ scope, filtered, family, onResetFilters }: ScopeEmptyProps) {
  const { t } = useTranslation("events");
  const { t: tHistory } = useTranslation("history");

  if (filtered) {
    const copy =
      scope === "upcoming"
        ? { title: t("empty.filtered.title"), description: t("empty.filtered.description") }
        : { title: tHistory("filtered.title"), description: tHistory("filtered.description") };

    return (
      <BoardEmpty
        icon={ListFilterIcon}
        {...copy}
        action={
          <Button type="button" size="sm" variant="outline" onClick={onResetFilters}>
            {t("empty.filtered.action")}
          </Button>
        }
      />
    );
  }

  if (scope === "history") {
    return (
      <BoardEmpty
        icon={ArchiveIcon}
        title={tHistory("empty.title")}
        description={tHistory("empty.description")}
        action={
          <Button asChild size="sm" variant="outline">
            <Link to="/">{tHistory("empty.action")}</Link>
          </Button>
        }
      />
    );
  }

  if (isFirstSyncRunning(family)) {
    return (
      <BoardEmpty
        icon={HourglassIcon}
        title={t("empty.syncing.title")}
        description={t("empty.syncing.description")}
      />
    );
  }

  return (
    <BoardEmpty
      icon={CalendarCheckIcon}
      title={t("empty.nothing.title")}
      description={t("empty.nothing.description")}
      action={
        <Button asChild size="sm" variant="outline">
          <Link to="/children">{t("empty.nothing.action")}</Link>
        </Button>
      }
    />
  );
}

export interface EventBoardProps {
  scope: EventScope;
  filters: EventFilters;
  family: readonly ChildDto[];
  onResetFilters: () => void;
}

export function EventBoard({ scope, filters, family, onResetFilters }: EventBoardProps) {
  const { t } = useTranslation("events");
  const { t: tHistory } = useTranslation("history");
  const events = useInfiniteQuery(eventPagesQueryOptions(scope, filters));
  const filtered = filters.category !== null || filters.childId !== null;

  return (
    <QueryState
      query={events}
      skeleton={
        <EventBoardSkeleton
          label={scope === "upcoming" ? t("list.loading") : tHistory("loading")}
        />
      }
      empty={
        <ScopeEmpty
          scope={scope}
          filtered={filtered}
          family={family}
          onResetFilters={onResetFilters}
        />
      }
      isEmpty={(data) => data.pages.every((page) => page.items.length === 0)}
    >
      {(data) => (
        <div className="flex flex-col gap-4">
          <EventList
            events={data.pages.flatMap((page) => page.items)}
            childLabel={(childId) => childLabelOf(family, childId)}
            childColor={(childId) => childHue(family, childId)}
            muted={scope === "history"}
          />
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
      )}
    </QueryState>
  );
}
