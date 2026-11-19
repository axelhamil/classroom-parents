import { shiftDate } from "@packages/ddd-kit/days";

const CRLF = "\r\n";

const LINE_OCTETS = 75;

const encoder = new TextEncoder();

function isAllowedCharacter(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;

  return code === 0x09 || (code >= 0x20 && code !== 0x7f);
}

/**
 * Escapes a TEXT value (RFC 5545 §3.3.11) and drops the control characters a
 * calendar parser rejects, so free text from Classroom never breaks the file.
 */
export function escapeText(value: string): string {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");

  return Array.from(escaped).filter(isAllowedCharacter).join("");
}

/**
 * Folds a content line at 75 octets (RFC 5545 §3.1), never inside a UTF-8
 * character: counting characters instead of octets corrupts accented text.
 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  let limit = LINE_OCTETS;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
      limit = LINE_OCTETS - 1;
    }
    current += char;
    octets += size;
  }
  parts.push(current);

  return parts.join(`${CRLF} `);
}

/** An ISO date (`2026-11-19`) as a DATE value (`20261119`). */
export function dateValue(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

/** An instant as a UTC DATE-TIME value (`20261119T073000Z`). */
export function utcValue(instant: Date): string {
  return `${instant.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
}

/** The start and the exclusive end of an all-day event on an ISO date. */
export function allDayLines(isoDate: string): string[] {
  return [
    `DTSTART;VALUE=DATE:${dateValue(isoDate)}`,
    `DTEND;VALUE=DATE:${dateValue(shiftDate(isoDate, 1))}`,
  ];
}

/**
 * One display alarm per instant, triggered at an absolute time: the reminders
 * the parent planned in the app ring at the same moment in their calendar.
 */
export function alarmLines(summary: string, alarmsAt: readonly Date[]): string[] {
  return alarmsAt.flatMap((at) => [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(summary)}`,
    `TRIGGER;VALUE=DATE-TIME:${utcValue(at)}`,
    "END:VALARM",
  ]);
}

/** Folds every line and joins them with the CRLF the format requires, final one included. */
export function calendarText(lines: readonly string[]): string {
  return `${lines.map(foldLine).join(CRLF)}${CRLF}`;
}
