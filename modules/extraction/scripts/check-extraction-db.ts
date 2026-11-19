/**
 * Proves against a real Postgres what the shared extraction cache promises: a result stored by
 * one family's sync is served to another family only when that family's sync read the very
 * same text (the same post, or the same text posted elsewhere the same day); a family holding
 * an edited text, or nothing but an id or a hash, gets nothing and pays its own call. The table
 * names no family, refuses free text where the hash belongs, and a hit renews its retention.
 */

import { exitUnlessLocalDatabase, spanRecorder, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-extraction-db", process.env.DATABASE_URL);

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Result } from "@packages/ddd-kit";
import { db, eq, sql } from "@packages/drizzle";
import type { ILanguageModel, LlmRequest } from "@packages/llm/contract/language-model.port";
import type { LlmError } from "@packages/llm/contract/llm-error";
import { extractionResult } from "../schemas/extraction-result.schema";
import { ExtractionService } from "../src/application/services/extraction.service";
import type { ExtractionOutput } from "../src/application/services/extraction-output.schema";
import { DrizzleExtractionCache } from "../src/infrastructure/repositories/drizzle-extraction-cache";

const probe = `check-extraction-db-${crypto.randomUUID()}`;
const PUBLISHED_AT = new Date("2030-01-14T08:00:00.000Z");
const TEXT = `Évaluation de maths jeudi 17 janvier. ${probe}`;
const EDITED = `Évaluation de maths vendredi 18 janvier. ${probe}`;
const { instrumentation } = spanRecorder();

const calls: string[] = [];
const model: ILanguageModel = {
  parse: async <T>(request: LlmRequest<T>): Promise<Result<T, LlmError>> => {
    calls.push(request.scope.userId);
    const output: ExtractionOutput = {
      events: [
        {
          title: "Évaluation de maths",
          description: "Réviser.",
          category: "assessment",
          deadlineDate: "2030-01-17",
          deadlineTime: null,
          confidence: "high",
          dateExpression: "jeudi 17 janvier",
          evidenceQuote: "Évaluation de maths jeudi 17 janvier.",
          parentActions: [],
          toBring: [],
        },
      ],
      amends: [],
      injectionSuspected: false,
    };
    const parsed = request.schema.safeParse(output);

    return parsed.success
      ? Result.ok(parsed.data)
      : Result.fail({ code: "LLM_OUTPUT_INVALID", message: "stub" });
  },
  streamParse: async () => Result.fail({ code: "LLM_DISABLED", message: "stub" }),
};

const service = new ExtractionService(
  model,
  new DrizzleExtractionCache(instrumentation),
  instrumentation,
);

async function syncOf(
  family: string,
  announcementId: string,
  text: string,
  publishedAt = PUBLISHED_AT,
) {
  const before = calls.length;
  const result = await service.extract({
    userId: `${probe}-${family}`,
    announcementId: `${probe}-${announcementId}`,
    text,
    publishedAt,
    childNames: [`Enfant${family}`],
  });

  return { result, called: calls.length > before };
}

function rowsOfProbe() {
  return db
    .select()
    .from(extractionResult)
    .where(sql`${extractionResult.announcementId} like ${`${probe}-%`}`);
}

const { step, run } = stepRunner("check-extraction-db", async () => {
  await db
    .delete(extractionResult)
    .where(sql`${extractionResult.announcementId} like ${`${probe}-%`}`);
});

run(async () => {
  const first = await syncOf("a", "post", TEXT);
  await step(
    "the first family to read a post pays one call and leaves one shared result",
    first.called && first.result.isSuccess && (await rowsOfProbe()).length === 1,
    await rowsOfProbe(),
  );

  const [stored] = await rowsOfProbe();
  await step(
    "the shared result names no family, its text is kept only as a SHA-256",
    stored !== undefined &&
      stored.contentHash === createHash("sha256").update(TEXT).digest("hex") &&
      !JSON.stringify(stored).includes("Enfanta"),
    stored,
  );

  const columns = await db.execute<{ column_name: string }>(
    sql`select column_name from information_schema.columns where table_name = 'extraction_result'`,
  );
  await step(
    "the table has no column that could point at a family",
    !columns.rows.some(({ column_name }) => /user|child|family|household|parent/.test(column_name)),
    columns.rows,
  );

  await db
    .update(extractionResult)
    .set({ lastReadAt: new Date("2020-01-01T00:00:00.000Z") })
    .where(eq(extractionResult.announcementId, `${probe}-post`));
  const sibling = await syncOf("b", "post", TEXT);
  const [touched] = await rowsOfProbe();
  await step(
    "a family whose sync read the same post gets the result without a call, and the hit renews it",
    !sibling.called &&
      isDeepStrictEqual(sibling.result.getValue(), first.result.getValue()) &&
      touched !== undefined &&
      touched.lastReadAt > new Date("2020-01-01T00:00:00.000Z"),
    sibling,
  );

  const otherCourse = await syncOf("c", "other-course-post", TEXT);
  await step(
    "the same text posted in another course the same day is not read twice",
    !otherCourse.called && otherCourse.result.isSuccess,
  );

  const edited = await syncOf("d", "post", EDITED);
  await step(
    "a family whose sync read an edited text of that post is not served the first reading",
    edited.called && edited.result.getValue().events[0]?.evidence === undefined,
    edited,
  );

  const hashOnly = await new DrizzleExtractionCache(instrumentation).find({
    announcementId: `${probe}-post`,
    text: createHash("sha256").update(TEXT).digest("hex"),
    publishedOn: "2030-01-14",
    timeZone: "Europe/Paris",
    promptVersion: "extraction-3",
  });
  await step(
    "holding the post id or its hash, without the text, reads nothing",
    hashOnly.isSuccess && hashOnly.getValue().isNone(),
    hashOnly,
  );

  const republished = await syncOf("e", "republished", TEXT, new Date("2030-01-20T08:00:00.000Z"));
  await step(
    "the same text published another day is read again, its dates depend on that day",
    republished.called,
  );

  const forged = await db
    .insert(extractionResult)
    .values({
      announcementId: `${probe}-forged`,
      contentHash: "Évaluation de maths jeudi 17 janvier",
      publishedOn: "2030-01-14",
      timeZone: "Europe/Paris",
      promptVersion: "extraction-3",
      result: { events: [], amendments: [] },
    })
    .then(
      () => "inserted",
      () => "refused",
    );
  await step("the database refuses announcement text where the hash belongs", forged === "refused");
}, "the shared extraction cache serves only families that read the same text");
