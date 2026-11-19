import type { Option, Result } from "@packages/ddd-kit";
import type { BankHolidayTerritory, SchoolZone } from "../../domain/value-objects/school-zone.vo";
import type { SchoolCalendarError } from "../errors/school-calendar-errors";
import type { BankHoliday, SchoolHoliday } from "./school-calendar-source.port";

export interface Cached<T> {
  entries: T[];
  fetchedAt: Date;
}

export interface ISchoolCalendarCache {
  holidays(
    zone: SchoolZone,
    schoolYear: string,
  ): Promise<Result<Option<Cached<SchoolHoliday>>, SchoolCalendarError>>;

  saveHolidays(
    zone: SchoolZone,
    schoolYear: string,
    entries: SchoolHoliday[],
    at: Date,
  ): Promise<Result<void, SchoolCalendarError>>;

  bankHolidays(
    territory: BankHolidayTerritory,
    year: number,
  ): Promise<Result<Option<Cached<BankHoliday>>, SchoolCalendarError>>;

  saveBankHolidays(
    territory: BankHolidayTerritory,
    year: number,
    entries: BankHoliday[],
    at: Date,
  ): Promise<Result<void, SchoolCalendarError>>;
}
