import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { childrenQueryOptions } from "../../shared/api/queries/children";
import { EventBoard, EventBoardSkeleton } from "../../shared/events/event-board";
import { EventFilterBar } from "../../shared/events/event-filter-bar";
import {
  type EventFiltersSearch,
  eventFiltersSearchSchema,
  filtersFromSearch,
} from "../../shared/events/event-filters.schema";
import { childHue } from "../../shared/format/child-hue";
import { Screen } from "../../shared/layout/screen";
import { QueryState } from "../../shared/query/query-state";

export const Route = createFileRoute("/_protected/_shell/history")({
  validateSearch: eventFiltersSearchSchema,
  component: HistoryPage,
});

function HistoryPage() {
  const { t } = useTranslation("history");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const filters = filtersFromSearch(search);
  const children = useQuery(childrenQueryOptions);

  const setSearch = (next: Partial<EventFiltersSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  return (
    <Screen title={t("title")}>
      <QueryState query={children} skeleton={<EventBoardSkeleton label={t("loading")} />}>
        {(family) => (
          <div className="flex flex-col gap-4">
            <EventFilterBar childrenList={family} filters={filters} onChange={setSearch} />
            <EventBoard
              scope="history"
              filters={filters}
              childColor={(childId) => childHue(family, childId)}
            />
          </div>
        )}
      </QueryState>
    </Screen>
  );
}
