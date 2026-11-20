import { createHash } from "node:crypto";
import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { and, dbOperationFailure, eq, inArray, resolveExecutor, sql } from "@packages/drizzle";
import {
  ACTION_CURRENCIES,
  PARENT_ACTION_KINDS,
  REVIEW_REASONS,
} from "@packages/events/agenda-contract";
import { z } from "zod";
import { extractionResult } from "../../../schemas/extraction-result.schema";
import type {
  ExtractionCacheError,
  ExtractionCacheKey,
  IExtractionCache,
} from "../../application/ports/extraction-cache.port";
import { AMENDMENT_KINDS, type ExtractionResult } from "../../domain/extracted-event";
import { extractionCategorySchema } from "../../domain/value-objects/extraction-category.vo";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const cacheFailure = dbOperationFailure("EXTRACTION_CACHE_PROVIDER_FAILURE");

const storedResultSchema = z.object({
  events: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      category: extractionCategorySchema,
      deadlineDate: z.string(),
      deadlineTime: z.string().optional(),
      confidence: z.enum(["high", "medium", "low"]),
      needsReview: z.boolean(),
      reviewReasons: z.array(z.enum(REVIEW_REASONS)),
      evidence: z
        .object({
          quote: z.string(),
          start: z.number(),
          end: z.number(),
          before: z.string(),
          after: z.string(),
        })
        .optional(),
      parentActions: z.array(
        z.object({
          kind: z.enum(PARENT_ACTION_KINDS),
          label: z.string(),
          amountCents: z.number().nullable(),
          currency: z.enum(ACTION_CURRENCIES).nullable(),
          quote: z.string(),
        }),
      ),
      toBring: z.array(z.object({ item: z.string(), quote: z.string() })),
    }),
  ),
  amendments: z.array(
    z.object({
      kind: z.enum(AMENDMENT_KINDS),
      reference: z.string(),
      referenceDate: z.string().optional(),
    }),
  ),
}) satisfies z.ZodType<ExtractionResult>;

function contentHashOf(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const UNKNOWN_ORDER = "unknown";

function storedDateOrder(key: ExtractionCacheKey): string {
  return key.dateOrder ?? UNKNOWN_ORDER;
}

function sameText(key: ExtractionCacheKey) {
  return and(
    eq(extractionResult.contentHash, contentHashOf(key.text)),
    eq(extractionResult.publishedOn, key.publishedOn),
    eq(extractionResult.timeZone, key.timeZone),
    eq(extractionResult.promptVersion, key.promptVersion),
    eq(extractionResult.outputLocale, key.outputLocale),
    eq(extractionResult.dateOrder, storedDateOrder(key)),
  );
}

/**
 * The shared extraction cache. A lookup hashes the text the caller holds and touches the row
 * it reads, so the retention sweep removes only results nobody read for 60 days.
 */
export class DrizzleExtractionCache implements IExtractionCache {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async find(
    key: ExtractionCacheKey,
  ): Promise<Result<Option<ExtractionResult>, ExtractionCacheError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleExtractionCache > find" }, async () => {
      try {
        const latest = exec
          .select({ id: extractionResult.id })
          .from(extractionResult)
          .where(sameText(key))
          .orderBy(
            sql`${extractionResult.announcementId} = ${key.announcementId} desc`,
            extractionResult.createdAt,
          )
          .limit(1);
        const query = exec
          .update(extractionResult)
          .set({ lastReadAt: sql`now()` })
          .where(inArray(extractionResult.id, latest))
          .returning({ result: extractionResult.result });
        const [row] = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );
        if (row === undefined) return Result.ok(Option.none());

        const stored = storedResultSchema.safeParse(row.result);
        return Result.ok(stored.success ? Option.some(stored.data) : Option.none());
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(cacheFailure("find", err));
      }
    });
  }

  async store(
    key: ExtractionCacheKey,
    result: ExtractionResult,
  ): Promise<Result<void, ExtractionCacheError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleExtractionCache > store" }, async () => {
      try {
        const query = exec
          .insert(extractionResult)
          .values({
            announcementId: key.announcementId,
            contentHash: contentHashOf(key.text),
            publishedOn: key.publishedOn,
            timeZone: key.timeZone,
            outputLocale: key.outputLocale,
            dateOrder: storedDateOrder(key),
            promptVersion: key.promptVersion,
            result,
          })
          .onConflictDoNothing();
        await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok();
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(cacheFailure("store", err));
      }
    });
  }
}
