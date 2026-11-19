import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { CALENDAR_KEY } from "../api/queries/events";
import { schoolToday } from "../format/school-today";

interface DayEvent {
  id: string;
  deadlineDate: string;
  done: boolean;
}

const calendarRangeSchema = z.tuple([z.string(), z.string(), z.string(), z.string()]);

function coversDay(queryKey: readonly unknown[], day: string): boolean {
  const range = calendarRangeSchema.safeParse(queryKey);
  if (!range.success) return false;

  const [, , from, to] = range.data;

  return from <= day && day <= to;
}

export function openDeadlinesOn(queryClient: QueryClient, day: string): number | undefined {
  const covering = queryClient
    .getQueriesData<DayEvent[]>({ queryKey: CALENDAR_KEY })
    .filter(([queryKey, events]) => events !== undefined && coversDay(queryKey, day));
  if (covering.length === 0) return undefined;

  const open = covering
    .flatMap(([, events]) => events ?? [])
    .filter((event) => event.deadlineDate === day && !event.done);

  return new Set(open.map((event) => event.id)).size;
}

function showOnIcon(count: number): void {
  const shown = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();

  void shown.catch(() => undefined);
}

export function useAppBadge(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;

    let shown: number | undefined;
    const refresh = () => {
      const count = openDeadlinesOn(queryClient, schoolToday(new Date()));
      if (count === undefined || count === shown) return;

      shown = count;
      showOnIcon(count);
    };

    refresh();
    return queryClient.getQueryCache().subscribe(refresh);
  }, [queryClient]);
}
