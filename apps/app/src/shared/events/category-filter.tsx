import { EVENT_CATEGORIES } from "@packages/events/agenda-contract";
import { useTranslation } from "react-i18next";
import { eventFiltersSearchSchema } from "./event-filters.schema";
import { CATEGORY_LABEL_KEYS, type EventCategory } from "./event-labels";
import { FilterChips } from "./filter-chips";

export interface CategoryFilterProps {
  value: EventCategory | null;
  onChange: (category: EventCategory | undefined) => void;
}

export function CategoryFilter({ value, onChange }: CategoryFilterProps) {
  const { t } = useTranslation("events");

  return (
    <FilterChips
      label={t("filters.category")}
      value={value}
      onChange={(category) =>
        onChange(eventFiltersSearchSchema.shape.category.parse(category ?? undefined))
      }
      options={[
        { value: null, label: t("filters.allCategories") },
        ...EVENT_CATEGORIES.map((category) => ({
          value: category,
          label: t(CATEGORY_LABEL_KEYS[category]),
        })),
      ]}
    />
  );
}
