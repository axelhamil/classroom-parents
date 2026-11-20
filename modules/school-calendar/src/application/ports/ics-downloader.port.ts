import type { Result } from "@packages/ddd-kit";
import type { SchoolCalendarError } from "../errors/school-calendar-errors";

export interface IIcsDownloader {
  download(url: string): Promise<Result<string, SchoolCalendarError>>;
}
