import { Option, Result, utcToZonedWall } from "@packages/ddd-kit";

const SCHOOL_TIME_ZONE = "Europe/Paris";

export interface SchoolDeadline {
  deadlineDate: string;
  deadlineTime: Option<string>;
}

export function schoolDeadline(utcDate: string, utcTime: Option<string>): Result<SchoolDeadline> {
  if (utcTime.isNone()) return Result.ok({ deadlineDate: utcDate, deadlineTime: Option.none() });

  const wall = utcToZonedWall(new Date(`${utcDate}T${utcTime.unwrap()}:00Z`), SCHOOL_TIME_ZONE);
  if (wall.isFailure) return Result.fail(wall.getError());

  return Result.ok({
    deadlineDate: wall.getValue().date,
    deadlineTime: Option.some(wall.getValue().time),
  });
}

export function dueDayKey(courseId: string, deadlineDate: string): string {
  return `${courseId}|${deadlineDate}`;
}
