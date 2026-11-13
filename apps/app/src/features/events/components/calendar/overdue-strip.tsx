import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon, ClockAlertIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { calendarEventsQueryOptions } from "../../api/events.queries";
import { isOverdue, overdueWindow } from "../../calendar";
import { OverdueSheet } from "./overdue-sheet";

export interface OverdueStripProps {
  family: readonly ChildDto[];
  childId: string | null;
  now: Date;
  today: string;
  before: string;
}

export function OverdueStrip({ family, childId, now, today, before }: OverdueStripProps) {
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
  const returnFocus = (event: Event) => {
    const target = trigger.current?.isConnected
      ? trigger.current
      : document.querySelector<HTMLElement>("main h1");
    if (!target) return;

    event.preventDefault();
    if (target.tabIndex < 0 && !target.hasAttribute("tabindex")) target.tabIndex = -1;
    target.focus();
  };

  return (
    <>
      {late.length > 0 && (
        <Button
          ref={trigger}
          variant="outline"
          className="w-full"
          aria-haspopup="dialog"
          aria-label={t("calendar.overdueCount", { count: late.length })}
          onClick={() => setOpened(late.map((event) => event.id))}
        >
          <ClockAlertIcon aria-hidden />
          {t("calendar.overdue")}
          <Badge variant="destructive">{late.length}</Badge>
          <ChevronRightIcon aria-hidden className="ms-auto" />
        </Button>
      )}
      {opened && (
        <OverdueSheet
          events={shown}
          count={late.length}
          family={family}
          now={now}
          today={today}
          onClose={() => setOpened(null)}
          onCloseAutoFocus={returnFocus}
        />
      )}
    </>
  );
}
