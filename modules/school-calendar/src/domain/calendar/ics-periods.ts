import { Result } from "@packages/ddd-kit";
import { shiftDate } from "@packages/ddd-kit/days";
import { OwnPeriod } from "./own-period.vo";

/** A school calendar is a few dozen events; a file past this size is not one. */
export const ICS_MAX_CHARACTERS = 512 * 1024;
const MAX_EVENTS = 1_000;
const MAX_PERIODS = 200;
const BASIC_DATE = /^(\d{4})(\d{2})(\d{2})$/;
const DAYS_DURATION = /^P(\d{1,3})([DW])$/;

export interface IcsReading {
  periods: OwnPeriod[];
  skipped: number;
}

interface Property {
  name: string;
  params: string;
  value: string;
}

type EventProperties = Map<string, Property>;

function unfold(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")
    .filter((line) => line.length > 0);
}

function propertyOf(line: string): Property | null {
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') quoted = !quoted;
    if (char === ":" && !quoted) {
      const head = line.slice(0, index);
      const separator = head.indexOf(";");
      const name = (separator === -1 ? head : head.slice(0, separator)).toUpperCase();

      return {
        name,
        params: separator === -1 ? "" : head.slice(separator + 1),
        value: line.slice(index + 1),
      };
    }
  }

  return null;
}

function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, char: string) =>
    char.toLowerCase() === "n" ? " " : char,
  );
}

function dateOf(property: Property | undefined): string | null {
  if (!property) return null;

  const match = BASIC_DATE.exec(property.value.trim());
  if (!match) return null;

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function lastDayOf(startsOn: string, event: EventProperties): string {
  const exclusiveEnd = dateOf(event.get("DTEND"));
  if (exclusiveEnd) return exclusiveEnd > startsOn ? shiftDate(exclusiveEnd, -1) : startsOn;

  const duration = DAYS_DURATION.exec(event.get("DURATION")?.value.trim() ?? "");
  if (!duration) return startsOn;

  const days = Number(duration[1]) * (duration[2] === "W" ? 7 : 1);

  return shiftDate(startsOn, Math.max(days - 1, 0));
}

function periodOf(event: EventProperties): OwnPeriod | null {
  if (event.get("STATUS")?.value.trim().toUpperCase() === "CANCELLED") return null;

  const startsOn = dateOf(event.get("DTSTART"));
  if (!startsOn) return null;

  const period = OwnPeriod.create({
    name: unescapeText(event.get("SUMMARY")?.value ?? ""),
    startsOn,
    endsOn: lastDayOf(startsOn, event),
  });

  return period.isSuccess ? period.getValue() : null;
}

function eventsOf(lines: string[]): Result<EventProperties[], string> {
  const events: EventProperties[] = [];
  let current: EventProperties | null = null;
  let nested = 0;

  for (const line of lines) {
    const property = propertyOf(line);
    if (!property) continue;

    const block = property.value.trim().toUpperCase();
    if (property.name === "BEGIN" && block === "VEVENT") current = new Map();
    else if (property.name === "BEGIN" && current) nested += 1;
    else if (property.name === "END" && current && nested > 0) nested -= 1;
    else if (property.name === "END" && block === "VEVENT" && current) {
      events.push(current);
      current = null;
      if (events.length > MAX_EVENTS) return Result.fail("the file holds too many events");
    } else if (current && nested === 0 && !current.has(property.name))
      current.set(property.name, property);
  }

  return Result.ok(events);
}

function distinct(periods: OwnPeriod[]): OwnPeriod[] {
  const byKey = new Map(
    periods.map((period) => [
      `${period.value.name}|${period.value.startsOn}|${period.value.endsOn}`,
      period,
    ]),
  );

  return [...byKey.values()].sort((left, right) =>
    left.value.startsOn.localeCompare(right.value.startsOn),
  );
}

/**
 * Reads the all-day events of an iCalendar text as holiday periods, and nothing else: no
 * recurrence is expanded, no attachment or alarm is read, timed events (a meeting, a show) are
 * skipped. `DTEND` of an all-day event is exclusive, so the last day off is the day before.
 */
export function readIcsPeriods(text: string): Result<IcsReading, string> {
  if (text.length > ICS_MAX_CHARACTERS) return Result.fail("the file is too large");

  const lines = unfold(text);
  if (lines[0]?.trim().toUpperCase() !== "BEGIN:VCALENDAR")
    return Result.fail("not an iCalendar file");

  const events = eventsOf(lines);
  if (events.isFailure) return Result.fail(events.getError());

  const read = events.getValue().map(periodOf);
  const periods = distinct(read.filter((period) => period !== null)).slice(0, MAX_PERIODS);
  if (periods.length === 0) return Result.fail("no all-day event in the file");

  return Result.ok({ periods, skipped: events.getValue().length - periods.length });
}
