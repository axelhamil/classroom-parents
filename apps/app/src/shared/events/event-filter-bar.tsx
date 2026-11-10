import { EVENT_CATEGORIES } from "@packages/events/agenda-contract";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../api/queries/children";
import type { EventFilters } from "../api/queries/events";
import { type EventFiltersSearch, eventFiltersSearchSchema } from "./event-filters.schema";
import { CATEGORY_LABEL_KEYS } from "./event-labels";
import { FilterChips } from "./filter-chips";

export interface EventFilterBarProps {
  childrenList: readonly ChildDto[];
  filters: EventFilters;
  onChange: (next: Partial<EventFiltersSearch>) => void;
}

export function EventFilterBar({ childrenList, filters, onChange }: EventFilterBarProps) {
  const { t } = useTranslation("events");

  return (
    <>
      {childrenList.length > 1 && (
        <FilterChips
          label={t("filters.child")}
          value={filters.childId}
          onChange={(childId) => onChange({ childId: childId ?? undefined })}
          options={[
            { value: null, label: t("filters.allChildren") },
            ...childrenList.map((child) => ({ value: child.id, label: child.label })),
          ]}
        />
      )}
      <FilterChips
        label={t("filters.category")}
        value={filters.category}
        onChange={(category) =>
          onChange({
            category: eventFiltersSearchSchema.shape.category.parse(category ?? undefined),
          })
        }
        options={[
          { value: null, label: t("filters.allCategories") },
          ...EVENT_CATEGORIES.map((category) => ({
            value: category,
            label: t(CATEGORY_LABEL_KEYS[category]),
          })),
        ]}
      />
    </>
  );
}
