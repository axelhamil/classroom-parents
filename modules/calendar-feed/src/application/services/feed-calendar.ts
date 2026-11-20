import { Option } from "@packages/ddd-kit";
import { PARIS_TIME_ZONE } from "@packages/ddd-kit/zoned-time";
import { deadlineLine } from "@packages/i18n";
import {
  alarmLines,
  allDayLines,
  CALENDAR_PRODUCT_ID,
  calendarText,
  dateValue,
  escapeText,
  eventIdentity,
  utcValue,
} from "@packages/icalendar";
import type { FeedEntry } from "../ports/feed-entries.port";

export const FEED_CALENDAR_NAME = "Échéances scolaires";

const DONE_SEPARATOR = " · ";

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

export interface FeedCalendarInput {
  entries: FeedEntry[];
  now: Date;
}

function timeValue(wallTime: string): string {
  const [hours = "00", minutes = "00", seconds = "00"] = wallTime.split(":");
  return `${hours}${minutes}${seconds.slice(0, 2)}`;
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

  return allDayLines(entry.deadlineDate);
}

function eventLines(entry: FeedEntry, stamp: string): string[] {
  const line = deadlineLine({ child: entry.childLabel, title: entry.title });
  const summary = entry.doneLabel.map((done) => `${done}${DONE_SEPARATOR}${line}`).unwrapOr(line);
  const url = webUrl(entry.classroomUrl);
  const description = [
    entry.courseName.map((name) => `Cours : ${name}`).unwrapOr(""),
    entry.description.trim(),
    url.map((href) => `Classroom : ${href}`).unwrapOr(""),
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");
  const ringing = entry.doneLabel.isSome() ? [] : entry.alarmsAt;

  return [
    "BEGIN:VEVENT",
    `UID:${eventIdentity(entry.eventId)}`,
    `DTSTAMP:${stamp}`,
    ...startLines(entry),
    `SUMMARY:${escapeText(summary)}`,
    ...(description.length > 0 ? [`DESCRIPTION:${escapeText(description)}`] : []),
    ...url.map((href) => [`URL:${href}`]).unwrapOr([]),
    `CATEGORIES:${escapeText(entry.categoryLabel)}`,
    "TRANSP:TRANSPARENT",
    ...alarmLines(summary, ringing),
    "END:VEVENT",
  ];
}

export function writeFeedCalendar(input: FeedCalendarInput): string {
  const stamp = utcValue(input.now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    CALENDAR_PRODUCT_ID,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `NAME:${escapeText(FEED_CALENDAR_NAME)}`,
    `X-WR-CALNAME:${escapeText(FEED_CALENDAR_NAME)}`,
    `X-WR-TIMEZONE:${PARIS_TIME_ZONE}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...PARIS_TIME_ZONE_LINES,
    ...input.entries.flatMap((entry) => eventLines(entry, stamp)),
    "END:VCALENDAR",
  ];

  return calendarText(lines);
}
