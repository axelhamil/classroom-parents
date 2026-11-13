import { Button } from "@packages/ui/components/ui/button";
import {
  CalendarDay,
  CalendarDayHeader,
  CalendarDayList,
  CalendarDayTitle,
} from "@packages/ui/components/ui/calendar-day";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@packages/ui/components/ui/drawer";
import { ScrollRegion } from "@packages/ui/components/ui/scroll-region";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../../shared/api/queries/children";
import type { EventItem } from "../../../../shared/api/queries/events";
import { dayLabel } from "../../../../shared/format/deadline-label";
import { TABLET_QUERY, useMediaQuery } from "../../../../shared/layout/use-media-query";
import { OVERDUE_WINDOW_DAYS } from "../../calendar";
import { CalendarEventRow } from "./calendar-event-row";

export interface OverdueSheetProps {
  events: readonly EventItem[];
  count: number;
  family: readonly ChildDto[];
  now: Date;
  today: string;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}

function byDate(events: readonly EventItem[]): [string, EventItem[]][] {
  const groups = new Map<string, EventItem[]>();
  for (const event of events)
    groups.set(event.deadlineDate, [...(groups.get(event.deadlineDate) ?? []), event]);

  return [...groups];
}

export function OverdueSheet({
  events,
  count,
  family,
  now,
  today,
  onClose,
  onCloseAutoFocus,
}: OverdueSheetProps) {
  const { t } = useTranslation("events");
  const tablet = useMediaQuery(TABLET_QUERY);
  const groupId = useId();
  const title = t("calendar.overdueCount", { count });
  const hint = t("calendar.overdueWindow", { count: OVERDUE_WINDOW_DAYS });
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  const list = (
    <ScrollRegion variant="list" label={t("calendar.overdueList")} className="max-md:px-4">
      <div className="flex flex-col gap-3">
        {byDate(events).map(([date, due]) => (
          <CalendarDay key={date} tone="past" aria-labelledby={`${groupId}${date}`}>
            <CalendarDayHeader>
              <CalendarDayTitle id={`${groupId}${date}`}>{dayLabel(date, now)}</CalendarDayTitle>
            </CalendarDayHeader>
            <CalendarDayList>
              {due.map((event) => (
                <li key={event.id}>
                  <CalendarEventRow event={event} family={family} now={now} today={today} compact />
                </li>
              ))}
            </CalendarDayList>
          </CalendarDay>
        ))}
      </div>
    </ScrollRegion>
  );

  return tablet ? (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t("calendar.close")}
        onCloseAutoFocus={onCloseAutoFocus}
        className="flex flex-col"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{hint}</DialogDescription>
        </DialogHeader>
        {list}
      </DialogContent>
    </Dialog>
  ) : (
    <Drawer open autoFocus onOpenChange={onOpenChange}>
      <DrawerContent onCloseAutoFocus={onCloseAutoFocus}>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{hint}</DrawerDescription>
        </DrawerHeader>
        {list}
        <DrawerFooter>
          <DrawerClose asChild>
            <Button type="button" variant="outline">
              {t("calendar.close")}
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
