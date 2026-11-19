import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import type { SchoolClock } from "../agenda/school-clock";
import { badgeCount, badgeRange } from "../agenda/views";
import type { DateRange } from "../agenda/windows";
import { CALENDAR_KEY, type EventItem } from "../api/queries/events";

const calendarRangeSchema = z.tuple([z.string(), z.string(), z.string(), z.string()]);

function covers(queryKey: readonly unknown[], { from, to }: DateRange): boolean {
  const range = calendarRangeSchema.safeParse(queryKey);
  if (!range.success) return false;

  const [, , loadedFrom, loadedTo] = range.data;

  return loadedFrom <= from && to <= loadedTo;
}

/** The badge count from the calendar already loaded, or undefined while no load covers the days it needs. */
export function badgeCountFromCache(
  queryClient: QueryClient,
  clock: SchoolClock,
): number | undefined {
  const needed = badgeRange(clock);
  const covering = queryClient
    .getQueriesData<EventItem[]>({ queryKey: CALENDAR_KEY })
    .filter(([queryKey, events]) => events !== undefined && covers(queryKey, needed));
  if (covering.length === 0) return undefined;

  const loaded = covering.flatMap(([, events]) => events ?? []);
  const unique = [...new Map(loaded.map((event) => [event.id, event])).values()];

  return badgeCount(unique, clock);
}

function showOnIcon(count: number): void {
  const shown = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();

  void shown.catch(() => undefined);
}

/** Shows on the app icon the number the home's briefing counts as open, for the same school day. */
export function useAppBadge(clock: SchoolClock): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;

    let shown: number | undefined;
    const refresh = () => {
      const count = badgeCountFromCache(queryClient, clock);
      if (count === undefined || count === shown) return;

      shown = count;
      showOnIcon(count);
    };

    refresh();
    return queryClient.getQueryCache().subscribe(refresh);
  }, [queryClient, clock]);
}
