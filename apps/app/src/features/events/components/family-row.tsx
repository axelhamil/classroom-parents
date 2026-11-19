import { Badge } from "@packages/ui/components/ui/badge";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { RollingCount } from "@packages/ui/components/ui/rolling-count";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import type { EventItem } from "../../../shared/api/queries/events";
import { FilterChips } from "../../../shared/events/filter-chips";
import { childHue } from "../../../shared/format/child-hue";

export interface FamilyRowProps {
  family: readonly ChildDto[];
  events: readonly EventItem[];
  value: string | null;
  onChange: (childId: string | null) => void;
}

function countByChild(events: readonly EventItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.childId, (counts.get(event.childId) ?? 0) + 1);

  return counts;
}

export function FamilyRow({ family, events, value, onChange }: FamilyRowProps) {
  const { t } = useTranslation("events");
  const counts = countByChild(events);

  return (
    <FilterChips
      label={t("filters.child")}
      data-tour="home-family"
      value={value}
      onChange={onChange}
      options={[
        { value: null, label: t("family.all") },
        ...family.map((child) => ({
          value: child.id,
          hue: childHue(family, child.id),
          hint: t("family.hint", {
            child: child.label,
            count: counts.get(child.id) ?? 0,
          }),
          label: (
            <>
              <ChildAvatar name={child.label} tone={childHue(family, child.id)} size="xs" />
              <span className="max-w-40 truncate">{child.label}</span>
              <Badge variant="soon" aria-hidden>
                <RollingCount value={counts.get(child.id) ?? 0} />
              </Badge>
              <span className="sr-only">
                {t("family.count", { count: counts.get(child.id) ?? 0 })}
              </span>
            </>
          ),
        })),
      ]}
    />
  );
}
