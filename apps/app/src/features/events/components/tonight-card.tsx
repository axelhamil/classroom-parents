import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import type { EventItem } from "../../../shared/api/queries/events";
import { EventCard } from "../../../shared/events/event-card";
import { childHue, childLabelOf } from "../../../shared/format/child-hue";

export interface TonightCardProps {
  events: readonly EventItem[];
  family: readonly ChildDto[];
}

export function TonightCard({ events, family }: TonightCardProps) {
  const { t } = useTranslation("events");

  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2>{t("focus.tonight")}</h2>
        </CardTitle>
        <CardDescription>{t("focus.tonightHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {events.map((event) => (
            <li key={event.id}>
              <EventCard
                event={event}
                childLabel={family.length > 1 ? childLabelOf(family, event.childId) : ""}
                hue={childHue(family, event.childId)}
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
