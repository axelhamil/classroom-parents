import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";
import { SCHOOL_CALENDAR_KEY } from "../../../shared/api/queries/school-calendar";

const $settings = api["school-calendar"].settings.$get;
const $regions = api["school-calendar"].regions.$get;
const $preview = api["school-calendar"].preview.$get;

export type SchoolCalendarSettings = InferResponseType<typeof $settings, 200>;

export type SchoolHolidayMode = NonNullable<SchoolCalendarSettings["choice"]>["schoolHolidays"];

export function schoolCalendarSettingsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: [...SCHOOL_CALENDAR_KEY, "settings", userId] as const,
    queryFn: async ({ signal }) => {
      const res = await $settings({}, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadSchoolCalendarSettings");
      return res.json();
    },
  });
}

export function schoolCalendarRegionsQueryOptions(country: string) {
  return queryOptions({
    queryKey: [...SCHOOL_CALENDAR_KEY, "regions", country] as const,
    queryFn: async ({ signal }) => {
      const res = await $regions({ query: { country } }, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadSchoolCalendarRegions");
      return (await res.json()).regions;
    },
    staleTime: 24 * 60 * 60_000,
  });
}

export function schoolCalendarPreviewQueryOptions(country: string, region: string | null) {
  const query = region === null ? { country } : { country, region };

  return queryOptions({
    queryKey: [...SCHOOL_CALENDAR_KEY, "preview", country, region] as const,
    queryFn: async ({ signal }) => {
      const res = await $preview({ query }, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadSchoolCalendarPreview");
      return res.json();
    },
    staleTime: 60 * 60_000,
  });
}
