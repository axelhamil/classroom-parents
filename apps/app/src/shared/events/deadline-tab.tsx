import { DateTab } from "@packages/ui/components/ui/date-tab";
import { daysUntil, wallDateParts } from "../format/deadline-label";

const URGENT_WITHIN_DAYS = 1;

export interface DeadlineTabProps {
  date: string;
  now: Date;
  muted: boolean;
}

function toneOf(date: string, now: Date, muted: boolean) {
  if (muted) return "muted";

  return daysUntil(date, now) <= URGENT_WITHIN_DAYS ? "urgent" : "default";
}

export function DeadlineTab({ date, now, muted }: DeadlineTabProps) {
  const parts = wallDateParts(date);

  return (
    <DateTab
      dateTime={date}
      tone={toneOf(date, now, muted)}
      day={parts.day}
      month={parts.month}
      weekday={parts.weekday}
      aria-hidden
    />
  );
}
