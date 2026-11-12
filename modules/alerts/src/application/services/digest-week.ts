import { Option, Result } from "@packages/ddd-kit";
import { shiftDate } from "@packages/ddd-kit/days";
import { PARIS_TIME_ZONE, utcToZonedWall, zonedWallTimeToUtc } from "@packages/ddd-kit/zoned-time";
import type { DigestWeek } from "../ports/digest-audience.port";

export const DIGEST_SEND_TIME = "18:00";
const SUNDAY = 0;

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function digestWeekOf(weekStart: string): Result<DigestWeek, string> {
  const from = zonedWallTimeToUtc(weekStart, "00:00", PARIS_TIME_ZONE);
  const to = zonedWallTimeToUtc(shiftDate(weekStart, 7), "00:00", PARIS_TIME_ZONE);
  if (from.isFailure) return Result.fail(from.getError());
  if (to.isFailure) return Result.fail(to.getError());

  return Result.ok({ weekStart, from: from.getValue(), to: to.getValue() });
}

export function digestWeekDue(now: Date): Option<DigestWeek> {
  const wall = utcToZonedWall(now, PARIS_TIME_ZONE);
  if (wall.isFailure) return Option.none();

  const { date, time } = wall.getValue();
  if (weekdayOf(date) !== SUNDAY || time < DIGEST_SEND_TIME) return Option.none();

  const week = digestWeekOf(shiftDate(date, 1));
  return week.isSuccess ? Option.some(week.getValue()) : Option.none();
}
