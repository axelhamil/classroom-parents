import type { Option } from "@packages/ddd-kit";
import { z } from "zod";
import type { Academy } from "../../domain/academies";
import { ICS_MAX_CHARACTERS } from "../../domain/calendar/ics-periods";
import type { OwnPeriodOrigin } from "../../domain/calendar/own-period.vo";
import type {
  CalendarSource,
  SchoolCalendarChoice,
  SchoolHolidayMode,
} from "../../domain/calendar/school-calendar-choice.vo";
import { SCHOOL_HOLIDAY_MODES } from "../../domain/calendar/school-calendar-choice.vo";

const countryCode = z.string().regex(/^[A-Z]{2}$/);
const regionCode = z.string().min(1).max(32);

export const schoolCalendarQuerySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
});

export type SchoolCalendarQuery = z.infer<typeof schoolCalendarQuerySchema>;

export const regionsQuerySchema = z.object({ country: countryCode });

export const previewQuerySchema = z.object({
  country: countryCode,
  region: regionCode.optional(),
});

export type PreviewQuery = z.infer<typeof previewQuerySchema>;

export const choiceBodySchema = z.object({
  choice: z
    .object({
      country: countryCode,
      region: regionCode.nullable(),
      schoolHolidays: z.enum(SCHOOL_HOLIDAY_MODES),
    })
    .nullable(),
});

export type ChoiceBody = z.infer<typeof choiceBodySchema>["choice"];

export const periodBodySchema = z.object({
  name: z.string().max(200),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
});

export type PeriodBody = z.infer<typeof periodBodySchema>;

export const periodParamSchema = z.object({ id: z.uuid() });

export const icsImportBodySchema = z.union([
  z.object({ url: z.url({ protocol: /^https$/ }).max(2_048) }),
  z.object({ content: z.string().min(1).max(ICS_MAX_CHARACTERS) }),
]);

export type IcsImportBody = z.infer<typeof icsImportBodySchema>;

export interface HolidayDto {
  name: string;
  startsOn: string;
  endsOn: string;
}

export interface BankHolidayDto {
  date: string;
  name: string;
}

export interface ChoiceDto {
  country: string;
  region: string | null;
  schoolHolidays: SchoolHolidayMode;
  source: CalendarSource;
}

export interface SchoolCalendarDto {
  choice: ChoiceDto | null;
  holidays: HolidayDto[];
  bankHolidays: BankHolidayDto[];
  schoolHolidaysCovered: boolean;
}

export interface PeriodDto extends HolidayDto {
  id: string;
  origin: OwnPeriodOrigin;
}

export interface CountryDto {
  code: string;
  officialSchoolHolidays: boolean;
  bankHolidays: boolean;
}

export interface SchoolCalendarSettingsDto {
  choice: ChoiceDto | null;
  periods: PeriodDto[];
  suggestedCountry: string | null;
  countries: CountryDto[];
  academies: readonly Academy[];
}

export interface RegionDto {
  code: string;
  name: string;
}

export interface PreviewDto {
  holidays: HolidayDto[];
  bankHoliday: BankHolidayDto | null;
  schoolHolidaysCovered: boolean;
}

export function choiceDtoOf(choice: Option<SchoolCalendarChoice>): ChoiceDto | null {
  return choice.map((chosen) => ({ ...chosen.value, source: chosen.source() })).toNull();
}
