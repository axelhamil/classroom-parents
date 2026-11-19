import { z } from "zod";
import type { Academy } from "../../domain/academies";
import { type SchoolZoneValue, schoolZoneSchema } from "../../domain/value-objects/school-zone.vo";
import type { BankHoliday, SchoolHoliday } from "../ports/school-calendar-source.port";

export const schoolCalendarQuerySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
});

export type SchoolCalendarQuery = z.infer<typeof schoolCalendarQuerySchema>;

export const schoolZoneBodySchema = z.object({ zone: schoolZoneSchema.nullable() });

export interface SchoolCalendarDto {
  zone: SchoolZoneValue | null;
  holidays: SchoolHoliday[];
  bankHolidays: BankHoliday[];
}

export interface SchoolZoneDto {
  zone: SchoolZoneValue | null;
  academies: readonly Academy[];
}
