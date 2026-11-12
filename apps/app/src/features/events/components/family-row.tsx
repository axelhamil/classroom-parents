import { Badge } from "@packages/ui/components/ui/badge";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import { FilterChips } from "../../../shared/events/filter-chips";
import { childHue } from "../../../shared/format/child-hue";

export interface FamilyRowProps {
  family: readonly ChildDto[];
  weekCounts: ReadonlyMap<string, number>;
  value: string | null;
  onChange: (childId: string | null) => void;
}

export function FamilyRow({ family, weekCounts, value, onChange }: FamilyRowProps) {
  const { t } = useTranslation("events");

  return (
    <FilterChips
      label={t("filters.child")}
      value={value}
      onChange={onChange}
      options={[
        { value: null, label: t("family.all") },
        ...family.map((child) => ({
          value: child.id,
          label: (
            <>
              <ChildAvatar name={child.label} tone={childHue(family, child.id)} size="xs" />
              <span className="max-w-40 truncate">{child.label}</span>
              <Badge variant="soon" aria-hidden>
                {weekCounts.get(child.id) ?? 0}
              </Badge>
              <span className="sr-only">
                {t("family.count", { count: weekCounts.get(child.id) ?? 0 })}
              </span>
            </>
          ),
        })),
      ]}
    />
  );
}
