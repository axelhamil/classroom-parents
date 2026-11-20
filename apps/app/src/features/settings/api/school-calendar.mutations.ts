import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { api } from "../../../shared/api/api-client";

const $setChoice = api["school-calendar"].choice.$put;
const $addPeriod = api["school-calendar"].periods.$post;
const $removePeriod = api["school-calendar"].periods[":id"].$delete;
const $importPeriods = api["school-calendar"].periods.import.$post;

export type SchoolCalendarChoice = InferRequestType<typeof $setChoice>["json"]["choice"];

export type HolidayPeriodDraft = InferRequestType<typeof $addPeriod>["json"];

export type IcsImport = InferRequestType<typeof $importPeriods>["json"];

export const setSchoolCalendarMutationOptions = mutationOptions({
  mutationKey: ["school-calendar", "choice", "set"] as const,
  mutationFn: async (choice: SchoolCalendarChoice) => {
    const res = await $setChoice({ json: { choice } });
    if (!res.ok) await throwApiError(res, "setSchoolCalendar");
    return (await res.json()).choice;
  },
});

export const addSchoolHolidayMutationOptions = mutationOptions({
  mutationKey: ["school-calendar", "periods", "add"] as const,
  mutationFn: async (period: HolidayPeriodDraft): Promise<void> => {
    const res = await $addPeriod({ json: period });
    if (!res.ok) await throwApiError(res, "addSchoolHoliday");
  },
});

export const removeSchoolHolidayMutationOptions = mutationOptions({
  mutationKey: ["school-calendar", "periods", "remove"] as const,
  mutationFn: async (id: string): Promise<void> => {
    const res = await $removePeriod({ param: { id } });
    if (!res.ok) await throwApiError(res, "removeSchoolHoliday");
  },
});

export const importSchoolHolidaysMutationOptions = mutationOptions({
  mutationKey: ["school-calendar", "periods", "import"] as const,
  mutationFn: async (source: IcsImport) => {
    const res = await $importPeriods({ json: source });
    if (!res.ok) await throwApiError(res, "importSchoolHolidays");
    return res.json();
  },
});
