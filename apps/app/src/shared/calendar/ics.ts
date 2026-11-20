import { deadlineLine } from "@packages/i18n";
import {
  alarmLines,
  allDayLines,
  CALENDAR_PRODUCT_ID,
  calendarText,
  escapeText,
  eventIdentity,
  utcValue,
} from "@packages/icalendar";

const REVOKE_AFTER_MS = 1000;

export interface IcsDeadline {
  id: string;
  title: string;
  childLabel?: string | undefined;
  description: string;
  deadlineDate: string;
  deadlineTime?: string | undefined;
  deadlineAt: string;
  alarmsAt: readonly Date[];
}

function timing(deadline: IcsDeadline): string[] {
  if (deadline.deadlineTime === undefined) return allDayLines(deadline.deadlineDate);

  return [`DTSTART:${utcValue(new Date(deadline.deadlineAt))}`];
}

export function deadlineIcs(deadline: IcsDeadline, stamp: Date): string {
  const summary = deadlineLine({ child: deadline.childLabel, title: deadline.title });

  return calendarText([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    CALENDAR_PRODUCT_ID,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${eventIdentity(deadline.id)}`,
    `DTSTAMP:${utcValue(stamp)}`,
    ...timing(deadline),
    `SUMMARY:${escapeText(summary)}`,
    ...(deadline.description ? [`DESCRIPTION:${escapeText(deadline.description)}`] : []),
    "TRANSP:TRANSPARENT",
    ...alarmLines(summary, deadline.alarmsAt),
    "END:VEVENT",
    "END:VCALENDAR",
  ]);
}

export function icsFileName(title: string): string {
  const slug = title
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 60);

  return `${slug || "echeance"}.ics`;
}

export function downloadIcs(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
