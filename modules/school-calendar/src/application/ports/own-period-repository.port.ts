import type { Option, Result } from "@packages/ddd-kit";
import type { OwnPeriod, OwnPeriodOrigin } from "../../domain/calendar/own-period.vo";
import type { SchoolCalendarError } from "../errors/school-calendar-errors";

export interface StoredPeriod {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  origin: OwnPeriodOrigin;
}

type Outcome<T> = Promise<Result<T, SchoolCalendarError>>;

export interface IOwnPeriodRepository {
  periodsOf(userId: string): Outcome<StoredPeriod[]>;

  add(userId: string, period: OwnPeriod, at: Date): Outcome<void>;

  replaceImported(userId: string, periods: OwnPeriod[], at: Date): Outcome<number>;

  remove(userId: string, periodId: string): Outcome<Option<StoredPeriod>>;
}
