import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { api } from "../api-client";

const $schoolCalendar = api["school-calendar"].$get;

export type SchoolCalendarRange = InferRequestType<typeof $schoolCalendar>["query"];

export const SCHOOL_CALENDAR_KEY = ["school-calendar"] as const;

export function schoolCalendarQueryOptions(userId: string, range: SchoolCalendarRange) {
  return queryOptions({
    queryKey: [...SCHOOL_CALENDAR_KEY, userId, range.from, range.to] as const,
    queryFn: async ({ signal }) => {
      const res = await $schoolCalendar({ query: range }, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadSchoolCalendar");
      return res.json();
    },
    staleTime: 60 * 60_000,
  });
}
