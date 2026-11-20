import { utcToZonedWall } from "@packages/ddd-kit/zoned-time";
import { wallDateLabel, wallTimeLabel } from "@packages/i18n";
import { capitalize, daysBetween } from "../format/deadline-label";

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

function wallOf(instant: string, timeZone: string): WallInstant {
  const wall = utcToZonedWall(new Date(instant), timeZone);

  return wall.isSuccess
    ? wall.getValue()
    : { date: instant.slice(0, 10), time: instant.slice(11, 16) };
}

export function groupByDay<Item extends { createdAt: string }>(
  items: readonly Item[],
  timeZone: string,
): NotificationDay<Item>[] {
  const days: NotificationDay<Item>[] = [];

  for (const item of items) {
    const date = wallOf(item.createdAt, timeZone).date;
    const last = days.at(-1);

    if (last?.date === date) last.items.push(item);
    else days.push({ date, items: [item] });
  }

  return days;
}

export function notificationDayLabel(date: string, today: string, labels: DayLabels): string {
  const daysAgo = -daysBetween(today, date);
  if (daysAgo === 0) return labels.today;
  if (daysAgo === 1) return labels.yesterday;

  return capitalize(wallDateLabel(date, today));
}

export function notificationTimeLabel(createdAt: string, timeZone: string): string {
  return wallTimeLabel(wallOf(createdAt, timeZone).time);
}
