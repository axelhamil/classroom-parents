import type { Result } from "@packages/ddd-kit";
import type { BankHolidayTerritory, SchoolZone } from "../../domain/value-objects/school-zone.vo";
import type { SchoolCalendarError } from "../errors/school-calendar-errors";

export interface SchoolHoliday {
  name: string;
  startsOn: string;
  endsOn: string;
}

export interface BankHoliday {
  date: string;
  name: string;
}

export interface ISchoolCalendarSource {
  holidays(
    zone: SchoolZone,
    schoolYear: string,
  ): Promise<Result<SchoolHoliday[], SchoolCalendarError>>;

  bankHolidays(
    territory: BankHolidayTerritory,
    year: number,
  ): Promise<Result<BankHoliday[], SchoolCalendarError>>;
}
