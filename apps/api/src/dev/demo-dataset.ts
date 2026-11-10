import {
  DATASET_CHILDREN,
  DATASET_TODAY,
  type DatasetChild,
  type DatasetChildKey,
} from "@modules/extraction/eval/classroom-dataset";
import { DAY_MS } from "@packages/ddd-kit/days";

const WEEK_DAYS = 7;

function mondayOf(now: Date): number {
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const sinceMonday = (new Date(day).getUTCDay() + 6) % WEEK_DAYS;

  return day - sinceMonday * DAY_MS;
}

export function datasetShiftDays(now: Date): number {
  return Math.round((mondayOf(now) - Date.parse(`${DATASET_TODAY}T00:00:00Z`)) / DAY_MS);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function demoChild(key: DatasetChildKey): DatasetChild {
  const child = DATASET_CHILDREN.find((candidate) => candidate.key === key);
  if (!child) throw new Error(`unknown dataset child ${key}`);

  return child;
}

export function demoRefreshToken(key: DatasetChildKey): string {
  return `fake-refresh:${key}`;
}
