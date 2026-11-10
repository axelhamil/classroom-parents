import { DateTab } from "@packages/ui/components/ui/date-tab";
import { daysUntil, wallDateParts } from "../../../shared/format/deadline-label";

const URGENT_WITHIN_DAYS = 1;

export interface DeadlineTabProps {
  date: string;
  now: Date;
}

export function DeadlineTab({ date, now }: DeadlineTabProps) {
  const parts = wallDateParts(date);

  return (
    <DateTab
      dateTime={date}
      tone={daysUntil(date, now) <= URGENT_WITHIN_DAYS ? "urgent" : "default"}
      day={parts.day}
      month={parts.month}
      weekday={parts.weekday}
      aria-hidden
    />
  );
}
