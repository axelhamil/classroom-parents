import type { Option, Result } from "@packages/ddd-kit";
import type { SchoolCalendarChoice } from "../../domain/calendar/school-calendar-choice.vo";
import type { SchoolCalendarError } from "../errors/school-calendar-errors";

export interface ISchoolCalendarChoiceRepository {
  choiceOf(userId: string): Promise<Result<Option<SchoolCalendarChoice>, SchoolCalendarError>>;

  save(
    userId: string,
    choice: SchoolCalendarChoice,
    at: Date,
  ): Promise<Result<void, SchoolCalendarError>>;

  clear(userId: string): Promise<Result<void, SchoolCalendarError>>;
}
