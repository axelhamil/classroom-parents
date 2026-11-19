import type { Option, Result } from "@packages/ddd-kit";
import type { SchoolZone } from "../../domain/value-objects/school-zone.vo";
import type { SchoolCalendarError } from "../errors/school-calendar-errors";

export interface ISchoolZoneRepository {
  zoneOf(userId: string): Promise<Result<Option<SchoolZone>, SchoolCalendarError>>;

  save(userId: string, zone: SchoolZone, at: Date): Promise<Result<void, SchoolCalendarError>>;

  clear(userId: string): Promise<Result<void, SchoolCalendarError>>;
}
