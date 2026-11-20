import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { ExtractionResult } from "../../domain/extracted-event";
import type { ReaderLocale } from "../../domain/reader";
import type { DateOrder } from "../services/calendar-words";

/**
 * What an extraction depends on. `text` is the announcement as the family's sync just read it
 * in Classroom: the store keeps only its SHA-256, so a family can reach a stored result only
 * with a text it holds. The output language and the date order shape what the model wrote, so
 * they are part of the key; nothing in the key names a family.
 */
export interface ExtractionCacheKey {
  announcementId: string;
  text: string;
  publishedOn: string;
  timeZone: string;
  outputLocale: ReaderLocale;
  dateOrder: DateOrder | null;
  promptVersion: string;
}

export type ExtractionCacheError = AppError<"EXTRACTION_CACHE_PROVIDER_FAILURE">;

/**
 * Results shared between the families that read the same text: the one of this announcement,
 * or of another post holding the same text published the same day.
 */
export interface IExtractionCache {
  find(key: ExtractionCacheKey): Promise<Result<Option<ExtractionResult>, ExtractionCacheError>>;
  store(
    key: ExtractionCacheKey,
    result: ExtractionResult,
  ): Promise<Result<void, ExtractionCacheError>>;
}
