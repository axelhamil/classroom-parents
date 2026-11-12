import { DAY_MS } from "@packages/ddd-kit/days";
import { utcDay } from "@packages/i18n";

const LINE_OCTETS = 75;
const UID_DOMAIN = "echeances-classroom";
const REVOKE_AFTER_MS = 1000;

export interface IcsDeadline {
  id: string;
  title: string;
  description: string;
  deadlineDate: string;
  deadlineTime?: string | undefined;
  deadlineAt: string;
}

function escapeText(text: string): string {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r\n|\r|\n/g, "\\n");
}

function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let octets = 0;

  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? LINE_OCTETS : LINE_OCTETS - 1;
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);

  return parts.join("\r\n ");
}

function utcStamp(instant: Date): string {
  return instant
    .toISOString()
    .replaceAll(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function compactDate(date: string): string {
  return date.replaceAll("-", "");
}

function nextDay(date: string): string {
  return new Date(utcDay(date) + DAY_MS).toISOString().slice(0, 10);
}

function timing(deadline: IcsDeadline): string[] {
  if (deadline.deadlineTime === undefined)
    return [
      `DTSTART;VALUE=DATE:${compactDate(deadline.deadlineDate)}`,
      `DTEND;VALUE=DATE:${compactDate(nextDay(deadline.deadlineDate))}`,
    ];

  return [`DTSTART:${utcStamp(new Date(deadline.deadlineAt))}`];
}

export function deadlineIcs(deadline: IcsDeadline, stamp: Date): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${UID_DOMAIN}//FR`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${deadline.id}@${UID_DOMAIN}`,
    `DTSTAMP:${utcStamp(stamp)}`,
    ...timing(deadline),
    `SUMMARY:${escapeText(deadline.title)}`,
    ...(deadline.description ? [`DESCRIPTION:${escapeText(deadline.description)}`] : []),
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.map(fold).join("\r\n")}\r\n`;
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
