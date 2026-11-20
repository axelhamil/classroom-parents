import type { Option, Result } from "@packages/ddd-kit";
import type { CalendarEntry } from "../../domain/calendar/calendar-feed";
import type { SchoolCalendarError } from "../errors/school-calendar-errors";
import type { Region } from "./school-calendar-source.port";

export interface Cached<T> {
  entries: T[];
  fetchedAt: Date;
}

type Outcome<T> = Promise<Result<T, SchoolCalendarError>>;

export interface ISchoolCalendarCache {
  entries(key: string): Outcome<Option<Cached<CalendarEntry>>>;

  saveEntries(key: string, entries: CalendarEntry[], at: Date): Outcome<void>;

  regions(key: string): Outcome<Option<Cached<Region>>>;

  saveRegions(key: string, regions: Region[], at: Date): Outcome<void>;
}
