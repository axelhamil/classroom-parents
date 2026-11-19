import { alarmLines, allDayLines, calendarText, escapeText, utcValue } from "@packages/icalendar";

const UID_DOMAIN = "echeances-classroom";
const REVOKE_AFTER_MS = 1000;

export interface IcsDeadline {
  id: string;
  summary: string;
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
  return calendarText([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${UID_DOMAIN}//FR`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${deadline.id}@${UID_DOMAIN}`,
    `DTSTAMP:${utcValue(stamp)}`,
    ...timing(deadline),
    `SUMMARY:${escapeText(deadline.summary)}`,
    ...(deadline.description ? [`DESCRIPTION:${escapeText(deadline.description)}`] : []),
    "TRANSP:TRANSPARENT",
    ...alarmLines(deadline.summary, deadline.alarmsAt),
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
