import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  type EventFiltersSearch,
  eventFiltersSearchSchema,
  filtersFromSearch,
} from "../../shared/events/event-filters.schema";
import { Screen } from "../../shared/layout/screen";
import { HistoryList } from "./components/history-list";

export const Route = createFileRoute("/_protected/_shell/history")({
  validateSearch: eventFiltersSearchSchema,
  component: HistoryPage,
});

function HistoryPage() {
  const { t } = useTranslation("history");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <Screen title={t("title")}>
      <HistoryList
        filters={filtersFromSearch(search)}
        onFiltersChange={(next: Partial<EventFiltersSearch>) =>
          void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true })
        }
      />
    </Screen>
  );
}
