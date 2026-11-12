import { Option } from "@packages/ddd-kit";
import { shiftDate } from "@packages/ddd-kit/days";
import { PARIS_TIME_ZONE } from "@packages/ddd-kit/zoned-time";
import type { FeedEntry } from "../ports/feed-entries.port";

export const FEED_CALENDAR_NAME = "Échéances scolaires";

const CRLF = "\r\n";

const LINE_OCTETS = 75;

const PARIS_TIME_ZONE_LINES = [
  "BEGIN:VTIMEZONE",
  `TZID:${PARIS_TIME_ZONE}`,
  `X-LIC-LOCATION:${PARIS_TIME_ZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const encoder = new TextEncoder();

export interface FeedCalendarInput {
  entries: FeedEntry[];
  appHost: string;
  now: Date;
}

function isAllowedCharacter(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code === 0x09 || (code >= 0x20 && code !== 0x7f);
}

export function escapeText(value: string): string {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");

  return Array.from(escaped).filter(isAllowedCharacter).join("");
}

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

function dateValue(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

function timeValue(wallTime: string): string {
  const [hours = "00", minutes = "00", seconds = "00"] = wallTime.split(":");
  return `${hours}${minutes}${seconds.slice(0, 2)}`;
}

function utcValue(instant: Date): string {
  return `${instant.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
}

function webUrl(raw: Option<string>): Option<string> {
  return raw.flatMap(httpUrl);
}

function httpUrl(raw: string): Option<string> {
  if (!URL.canParse(raw)) return Option.none();

  const url = new URL(raw);
  return url.protocol === "https:" || url.protocol === "http:"
    ? Option.some(url.href)
    : Option.none();
}

function startLines(entry: FeedEntry): string[] {
  if (entry.deadlineTime.isSome()) {
    const start = `${dateValue(entry.deadlineDate)}T${timeValue(entry.deadlineTime.unwrap())}`;
    return [`DTSTART;TZID=${PARIS_TIME_ZONE}:${start}`];
  }

  return [
    `DTSTART;VALUE=DATE:${dateValue(entry.deadlineDate)}`,
    `DTEND;VALUE=DATE:${dateValue(shiftDate(entry.deadlineDate, 1))}`,
  ];
}

function eventLines(entry: FeedEntry, appHost: string, stamp: string): string[] {
  const summary = `${entry.childLabel} · ${entry.title}`;
  const url = webUrl(entry.classroomUrl);
  const description = [
    entry.description.trim(),
    url.map((href) => `Classroom : ${href}`).unwrapOr(""),
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");
  const alarms = entry.alarmsAt.flatMap((at) => [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(summary)}`,
    `TRIGGER;VALUE=DATE-TIME:${utcValue(at)}`,
    "END:VALARM",
  ]);

  return [
    "BEGIN:VEVENT",
    `UID:${entry.eventId}@${appHost}`,
    `DTSTAMP:${stamp}`,
    ...startLines(entry),
    `SUMMARY:${escapeText(summary)}`,
    ...(description.length > 0 ? [`DESCRIPTION:${escapeText(description)}`] : []),
    ...url.map((href) => [`URL:${href}`]).unwrapOr([]),
    `CATEGORIES:${escapeText(entry.categoryLabel)}`,
    "TRANSP:TRANSPARENT",
    ...alarms,
    "END:VEVENT",
  ];
}

export function writeFeedCalendar(input: FeedCalendarInput): string {
  const stamp = utcValue(input.now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//classroom-parents//calendar feed//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `NAME:${escapeText(FEED_CALENDAR_NAME)}`,
    `X-WR-CALNAME:${escapeText(FEED_CALENDAR_NAME)}`,
    `X-WR-TIMEZONE:${PARIS_TIME_ZONE}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...PARIS_TIME_ZONE_LINES,
    ...input.entries.flatMap((entry) => eventLines(entry, input.appHost, stamp)),
    "END:VCALENDAR",
  ];

  return `${lines.map(foldLine).join(CRLF)}${CRLF}`;
}
