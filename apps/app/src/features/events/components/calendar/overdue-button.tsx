import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon, ClockAlertIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { ResponsiveOverlay } from "../../../../shared/layout/responsive-overlay";
import { calendarEventsQueryOptions } from "../../api/events.queries";
import { isOverdue, OVERDUE_WINDOW_DAYS, overdueWindow } from "../../calendar";
import { OverdueList } from "./overdue-list";

export interface OverdueButtonProps {
  family: readonly ChildDto[];
  childId: string | null;
  now: Date;
  today: string;
  before: string;
}

export function OverdueButton({ family, childId, now, today, before }: OverdueButtonProps) {
  const { t } = useTranslation("events");
  const trigger = useRef<HTMLButtonElement>(null);
  const [opened, setOpened] = useState<readonly string[] | null>(null);
  const loaded = useQuery(calendarEventsQueryOptions(overdueWindow(today))).data ?? [];
  const late = loaded.filter(
    (event) =>
      isOverdue(event, today) &&
      event.deadlineDate < before &&
      (childId === null || event.childId === childId),
  );
  const shown = loaded
    .filter((event) => opened?.includes(event.id))
    .sort((left, right) => right.deadlineDate.localeCompare(left.deadlineDate));
  const title = t("calendar.overdueCount", { count: late.length });

  return (
    <>
      {late.length > 0 && (
        <Button
          ref={trigger}
          variant="outline"
          className="w-full"
          aria-haspopup="dialog"
          aria-label={title}
          onClick={() => setOpened(late.map((event) => event.id))}
        >
          <ClockAlertIcon aria-hidden />
          {t("calendar.overdue")}
          <Badge variant="destructive">{late.length}</Badge>
          <ChevronRightIcon aria-hidden className="ms-auto" />
        </Button>
      )}
      {opened && (
        <ResponsiveOverlay
          docked="dialog"
          title={title}
          description={t("calendar.overdueWindow", { count: OVERDUE_WINDOW_DAYS })}
          returnFocus={() => (trigger.current ? [trigger.current] : [])}
          onClose={() => setOpened(null)}
        >
          <OverdueList events={shown} family={family} now={now} today={today} />
        </ResponsiveOverlay>
      )}
    </>
  );
}
