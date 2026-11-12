import { z } from "zod";
import { removeStoredValue, useStoredValue } from "../storage/use-stored-value";

const SEEN = z.boolean();

export function tourKey(userId: string, screen: string): string {
  return `tour:${userId}:${screen}`;
}

export function resetTours(userId: string, screens: readonly string[]): void {
  for (const screen of screens) removeStoredValue(tourKey(userId, screen));
}

export interface TourState {
  open: boolean;
  done: () => void;
  restart: () => void;
}

export function useTour<S extends string>(screen: S, userId: string): TourState {
  const key = tourKey(userId, screen);
  const [seen, setSeen] = useStoredValue(key, SEEN, false);

  return {
    open: !seen,
    done: () => setSeen(true),
    restart: () => removeStoredValue(key),
  };
}
