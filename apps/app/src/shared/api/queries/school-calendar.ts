import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { z } from "zod";
import { api } from "../api-client";

const $schoolCalendar = api["school-calendar"].$get;

export type SchoolCalendarRange = InferRequestType<typeof $schoolCalendar>["query"];

export const SCHOOL_CALENDAR_KEY = ["school-calendar"] as const;

const wallDateSchema = z.iso.date();

/**
 * The days off the app reads from the school calendar, checked on arrival: an answer of another
 * shape fails the query (and reaches telemetry) instead of breaking every screen that needs a clock.
 */
const schoolCalendarDaysSchema = z.object({
  holidays: z.array(z.object({ startsOn: wallDateSchema, endsOn: wallDateSchema })),
  bankHolidays: z.array(z.object({ date: wallDateSchema })),
});

export type SchoolCalendarDays = z.infer<typeof schoolCalendarDaysSchema>;

export function schoolCalendarQueryOptions(userId: string, range: SchoolCalendarRange) {
  return queryOptions({
    queryKey: [...SCHOOL_CALENDAR_KEY, userId, range.from, range.to] as const,
    queryFn: async ({ signal }) => {
      const res = await $schoolCalendar({ query: range }, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadSchoolCalendar");
      return schoolCalendarDaysSchema.parse(await res.json());
    },
    staleTime: 60 * 60_000,
  });
}
