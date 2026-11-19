import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { ExtractionResult } from "../../domain/extracted-event";

/**
 * What an extraction depends on. `text` is the announcement as the family's sync just read it
 * in Classroom: the store keeps only its SHA-256, so a family can reach a stored result only
 * with a text it holds. Nothing in the key belongs to a family.
 */
export interface ExtractionCacheKey {
  announcementId: string;
  text: string;
  publishedOn: string;
  timeZone: string;
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
