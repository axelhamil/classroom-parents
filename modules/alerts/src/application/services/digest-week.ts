import { Option, Result } from "@packages/ddd-kit";
import { shiftDate, weekdayOf } from "@packages/ddd-kit/days";
import {
  utcToZonedWall,
  zonedWallTimeToUtc,
  zonedWallTimeToUtcShifted,
} from "@packages/ddd-kit/zoned-time";
import type { DigestWeek } from "../ports/digest-audience.port";

export const DIGEST_SEND_TIME = "18:00";

const EARLIEST_ZONE = "Etc/GMT-14";
const LATEST_ZONE = "Etc/GMT+12";
const SATURDAY = 6;
const SUNDAY = 0;

export interface DigestTiming {
  dueAt: Date;
  expiresAt: Date;
}

export function digestWeekOf(weekStart: string, timeZone: string): Result<DigestWeek, string> {
  const from = zonedWallTimeToUtc(weekStart, "00:00", timeZone);
  const to = zonedWallTimeToUtc(shiftDate(weekStart, 7), "00:00", timeZone);
  if (from.isFailure) return Result.fail(from.getError());
  if (to.isFailure) return Result.fail(to.getError());

  return Result.ok({ weekStart, from: from.getValue(), to: to.getValue() });
}

export function digestTimingOf(weekStart: string, timeZone: string): Result<DigestTiming, string> {
  const evening = zonedWallTimeToUtcShifted(shiftDate(weekStart, -1), DIGEST_SEND_TIME, timeZone);
  const week = digestWeekOf(weekStart, timeZone);
  if (evening.isFailure) return Result.fail(evening.getError());
  if (week.isFailure) return Result.fail(week.getError());

  return Result.ok({ dueAt: evening.getValue().at, expiresAt: week.getValue().from });
}

export function digestWeekDue(now: Date): Option<DigestWeek> {
  const weekStart = upcomingWeekStart(now);
  if (weekStart.isNone()) return Option.none();

  const earliest = digestTimingOf(weekStart.unwrap(), EARLIEST_ZONE);
  const latest = digestTimingOf(weekStart.unwrap(), LATEST_ZONE);
  if (earliest.isFailure || latest.isFailure) return Option.none();
  if (now < earliest.getValue().dueAt || now >= latest.getValue().expiresAt) return Option.none();

  return everyZoneWeek(weekStart.unwrap());
}

function upcomingWeekStart(now: Date): Option<string> {
  const wall = utcToZonedWall(now, LATEST_ZONE);
  if (wall.isFailure) return Option.none();

  const { date } = wall.getValue();
  if (weekdayOf(date) === SATURDAY) return Option.some(shiftDate(date, 2));
  if (weekdayOf(date) === SUNDAY) return Option.some(shiftDate(date, 1));

  return Option.none();
}

function everyZoneWeek(weekStart: string): Option<DigestWeek> {
  const earliest = digestWeekOf(weekStart, EARLIEST_ZONE);
  const latest = digestWeekOf(weekStart, LATEST_ZONE);
  if (earliest.isFailure || latest.isFailure) return Option.none();

  return Option.some({ weekStart, from: earliest.getValue().from, to: latest.getValue().to });
}
