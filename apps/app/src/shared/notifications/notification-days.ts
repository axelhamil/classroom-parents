import { PARIS_TIME_ZONE, utcToZonedWall } from "@packages/ddd-kit/zoned-time";
import { wallDateLabel, wallTimeLabel } from "@packages/i18n";
import { capitalize, daysUntil } from "../format/deadline-label";
import { schoolToday } from "../format/school-today";

interface WallInstant {
  date: string;
  time: string;
}

export interface NotificationDay<Item> {
  date: string;
  items: Item[];
}

export interface DayLabels {
  today: string;
  yesterday: string;
}

function wallOf(instant: string): WallInstant {
  const wall = utcToZonedWall(new Date(instant), PARIS_TIME_ZONE);

  return wall.isSuccess
    ? wall.getValue()
    : { date: instant.slice(0, 10), time: instant.slice(11, 16) };
}

export function groupByDay<Item extends { createdAt: string }>(
  items: readonly Item[],
): NotificationDay<Item>[] {
  const days: NotificationDay<Item>[] = [];

  for (const item of items) {
    const date = wallOf(item.createdAt).date;
    const last = days.at(-1);

    if (last?.date === date) last.items.push(item);
    else days.push({ date, items: [item] });
  }

  return days;
}

export function notificationDayLabel(date: string, now: Date, labels: DayLabels): string {
  const daysAgo = -daysUntil(date, now);
  if (daysAgo === 0) return labels.today;
  if (daysAgo === 1) return labels.yesterday;

  return capitalize(wallDateLabel(date, schoolToday(now)));
}

export function notificationTimeLabel(createdAt: string): string {
  return wallTimeLabel(wallOf(createdAt).time);
}
