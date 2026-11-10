import { PARIS_TIME_ZONE, utcToZonedWall } from "@packages/ddd-kit/zoned-time";

export function schoolToday(now: Date): string {
  const wall = utcToZonedWall(now, PARIS_TIME_ZONE);

  return wall.isSuccess ? wall.getValue().date : now.toISOString().slice(0, 10);
}
