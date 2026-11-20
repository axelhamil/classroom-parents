import { Button } from "@packages/ui/components/ui/button";
import { AddIcon, NothingDueIcon } from "@packages/ui/components/ui/icons";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { BoardEmpty } from "../../../../shared/events/event-board";
import { dayLabel, inSentence } from "../../../../shared/format/deadline-label";
import { nextEventQueryOptions } from "../../api/events.queries";

export interface PeriodEmptyProps {
  family: readonly ChildDto[];
  childId: string | null;
  today: string;
  onAdd: () => void;
  onGoTo: (date: string) => void;
}

function useLastRead(family: readonly ChildDto[]): string {
  const { t } = useTranslation("children");
  const formatDateTime = useFormatDateTime("medium");
  if (family.some((child) => child.syncing)) return t("card.syncing");

  const latest = family
    .flatMap((child) => (child.lastSyncedAt ? [child.lastSyncedAt] : []))
    .sort()
    .at(-1);

  return latest ? t("card.lastSynced", { date: formatDateTime(latest) }) : t("card.neverSynced");
}

export function PeriodEmpty({ family, childId, today, onAdd, onGoTo }: PeriodEmptyProps) {
  const { t } = useTranslation("events");
  const next = useQuery(nextEventQueryOptions(childId)).data;
  const watched = childId ? family.filter((child) => child.id === childId) : family;
  const lastRead = useLastRead(watched);

  return (
    <BoardEmpty
      icon={NothingDueIcon}
      title={t("calendar.periodEmpty")}
      description={lastRead}
      action={
        <>
          {next && (
            <Button variant="outline" onClick={() => onGoTo(next.deadlineDate)}>
              {t("calendar.nextEvent", {
                title: next.title,
                day: inSentence(dayLabel(next.deadlineDate, today)),
              })}
            </Button>
          )}
          <Button onClick={onAdd}>
            <AddIcon aria-hidden />
            {t("calendar.addEvent")}
          </Button>
        </>
      }
    />
  );
}
