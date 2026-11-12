import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import type { EventItem } from "../../../shared/api/queries/events";
import { EventCard } from "../../../shared/events/event-card";
import { childHue, childLabelOf } from "../../../shared/format/child-hue";
import { useChecklist } from "../hooks/use-checklist";
import { ChecklistRows } from "./prepare-checklist";

export interface TonightCardProps {
  events: readonly EventItem[];
  family: readonly ChildDto[];
}

interface TonightItemProps {
  event: EventItem;
  family: readonly ChildDto[];
}

function TonightItem({ event, family }: TonightItemProps) {
  const checklist = useChecklist(event);

  return (
    <li className="flex flex-col gap-1">
      <EventCard
        event={event}
        childLabel={family.length > 1 ? childLabelOf(family, event.childId) : ""}
        hue={childHue(family, event.childId)}
      />
      {checklist.items.length > 0 && <ChecklistRows checklist={checklist} />}
    </li>
  );
}

export function TonightCard({ events, family }: TonightCardProps) {
  const { t } = useTranslation("events");
  const titleId = useId();

  return (
    <section aria-labelledby={titleId}>
      <Card>
        <CardHeader>
          <CardTitle asChild>
            <h2 id={titleId}>{t("focus.tonight")}</h2>
          </CardTitle>
          <CardDescription>{t("focus.tonightHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-6">
            {events.map((event) => (
              <TonightItem key={event.id} event={event} family={family} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
