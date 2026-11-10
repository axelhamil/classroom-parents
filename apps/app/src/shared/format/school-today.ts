import { utcToZonedWall } from "@packages/ddd-kit/zoned-time";

export const SCHOOL_TIME_ZONE = "Europe/Paris";

export function schoolToday(now: Date): string {
  const wall = utcToZonedWall(now, SCHOOL_TIME_ZONE);

  return wall.isSuccess ? wall.getValue().date : now.toISOString().slice(0, 10);
}
