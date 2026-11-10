/**
 * Proves against a real Postgres what mocked ports cannot: two concurrent syncs of one child
 * write one ledger row and one ingest per announcement, the ledger row and the ingest commit or
 * roll back together, a failed announcement is retried once then recorded, a child no longer
 * holding its lease (being disconnected) gets nothing written, and the ledger of a family is
 * erased by the child cascade without touching another family. Google, the model and the agenda
 * are stubbed; the lease check reads the real child row.
 */

import { exitUnlessLocalDatabase, spanRecorder, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-sync-db", process.env.DATABASE_URL);

import { childAccount } from "@modules/children/schemas/child.schema";
import { seedParentWithChild } from "@modules/children/schemas/testing/seed-child";
import { type AppError, type ILogger, Result } from "@packages/ddd-kit";
import {
  and,
  authSchema,
  db,
  eq,
  inArray,
  like,
  outboxSchema,
  resolveExecutor,
  TransactionService,
} from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { DrizzleOutboxRepository } from "@packages/outbox/drizzle-outbox.repository";
import { emitEvent } from "@packages/outbox/event-emitter";
import { seenAnnouncement } from "../schemas/seen-announcement.schema";
import type {
  ExtractedDeadline,
  IAnnouncementExtractor,
} from "../src/application/ports/announcement-extractor.port";
import type { IChildSyncState } from "../src/application/ports/child-sync-state.port";
import type {
  Announcement,
  ClassroomError,
  IClassroomClient,
} from "../src/application/ports/classroom-client.port";
import type { IEventIngest } from "../src/application/ports/event-ingest.port";
import { ClassroomReader } from "../src/application/services/classroom-reader.service";
import { SyncChildService } from "../src/application/services/sync-child.service";
import { DrizzleSeenAnnouncementRepository } from "../src/infrastructure/repositories/drizzle-seen-announcement.repository";

const NOW = new Date("2030-01-10T08:00:00.000Z");
const probe = `check-sync-db-${crypto.randomUUID()}`;
const { instrumentation } = spanRecorder();
const outbox = new DrizzleOutboxRepository(instrumentation, () => undefined);
const transactions = new TransactionService(instrumentation, async (events) => {
  await outbox.enqueue(events, { source: "check-sync-db" });
});

const posts = new Map<string, Announcement[]>();
const ingested: string[] = [];
const ingestFailsFor = new Set<string>();

const classroom: IClassroomClient = {
  listCourses: async () => Result.ok([{ id: "course-1" }]),
  listAnnouncements: async (token) =>
    Result.ok<Announcement[], ClassroomError>(posts.get(token) ?? []),
  listCoursework: async () => Result.ok([]),
  listTurnedIn: async () => Result.ok([]),
  profileNames: async () => Result.ok([]),
};

const extractor: IAnnouncementExtractor = {
  extract: async ({ text }) => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return Result.ok<ExtractedDeadline[], AppError>([
      {
        title: text,
        description: "",
        category: "homework",
        deadlineDate: "2030-01-20",
        needsReview: false,
      },
    ]);
  },
};

const ingest: IEventIngest = {
  ingest: async ({ childId, announcement }) => {
    await emitEvent(
      outbox,
      EventTypes.ANNOUNCEMENT_SYNCED,
      "probe",
      `${probe}-${announcement.id}`,
      {
        userId: probe,
        childId,
        newAnnouncements: 0,
        eventsCreated: 0,
        actorUserId: null,
      },
    );
    if (ingestFailsFor.has(announcement.id))
      return Result.fail({ code: "EVENT_PROVIDER_FAILURE", message: "agenda down" });

    ingested.push(announcement.id);
    return Result.ok({ created: 1 });
  },
  ingestCoursework: async () => Result.ok({ created: 0 }),
  withdrawCourseworkOutside: async () => Result.ok({ withdrawn: 0 }),
};

const syncState: IChildSyncState = {
  holdsLease: async ({ childId, lease }) => {
    const rows = await resolveExecutor()
      .select({ id: childAccount.id })
      .from(childAccount)
      .where(
        and(
          eq(childAccount.id, childId),
          eq(childAccount.syncLease, lease),
          eq(childAccount.status, "connected"),
        ),
      )
      .for("share");
    return Result.ok(rows.length > 0);
  },
  markSynced: async () => Result.ok(),
  markSyncFailed: async () => Result.ok(),
  markNeedsReconnect: async () => Result.ok(),
};

const quiet: ILogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

const ledger = new DrizzleSeenAnnouncementRepository(instrumentation);
const service = new SyncChildService(
  new ClassroomReader(classroom, ledger, instrumentation),
  { accessTokenFor: async (childId) => Result.ok(childId) },
  extractor,
  ingest,
  syncState,
  ledger,
  transactions,
  outbox,
  instrumentation,
  quiet,
);

function post(id: string): Announcement {
  return {
    id: `${probe}-${id}`,
    courseId: "course-1",
    text: `Annonce ${id}`,
    publishedAt: new Date(NOW.getTime() - 86_400_000),
    url: `https://classroom.google.com/c/course-1/p/${id}`,
  };
}

async function family(name: string): Promise<{ userId: string; childId: string }> {
  const userId = `${probe}-${name}`;
  const childId = await seedParentWithChild({ userId, name, at: NOW, syncLease: 1 });

  return { userId, childId };
}

async function ledgerOf(childId: string) {
  return db.select().from(seenAnnouncement).where(eq(seenAnnouncement.childId, childId));
}

async function probeRows(announcementId: string): Promise<number> {
  const rows = await db
    .select({ id: outboxSchema.outboxEvent.id })
    .from(outboxSchema.outboxEvent)
    .where(eq(outboxSchema.outboxEvent.aggregateId, `${probe}-${announcementId}`));
  return rows.length;
}

const sync = (target: { userId: string; childId: string }, lease = 1) =>
  service.syncChild({ ...target, label: "Enfant", lease }, NOW);

async function cleanup(): Promise<void> {
  const children = await db
    .select({ id: childAccount.id })
    .from(childAccount)
    .where(like(childAccount.userId, `${probe}%`));
  await db
    .delete(outboxSchema.outboxEvent)
    .where(
      inArray(outboxSchema.outboxEvent.aggregateId, [
        ...children.map(({ id }) => id),
        ...[...posts.values()].flat().map(({ id }) => `${probe}-${id}`),
      ]),
    );
  await db.delete(authSchema.user).where(like(authSchema.user.id, `${probe}%`));
}

const { step, run } = stepRunner("check-sync-db", cleanup);

run(async () => {
  const a = await family("a");
  const b = await family("b");
  posts.set(a.childId, [post("a1"), post("a2"), post("a3")]);
  posts.set(b.childId, [post("b1")]);

  const [first, second] = await Promise.all([sync(a), sync(a)]);
  const aLedger = await ledgerOf(a.childId);
  await step(
    "two concurrent syncs of one child both succeed",
    first.isSuccess && second.isSuccess,
    {
      first: first.isFailure ? first.getError() : first.getValue(),
      second: second.isFailure ? second.getError() : second.getValue(),
    },
  );
  await step(
    "they leave one ledger row per announcement",
    aLedger.length === 3 && aLedger.every((row) => row.outcome === "extracted"),
    aLedger,
  );
  await step(
    "and one ingest per announcement",
    ingested.length === 3 && new Set(ingested).size === 3,
    ingested,
  );

  const again = await sync(a);
  await step(
    "a later sync finds the ledger and extracts nothing",
    again.isSuccess && again.getValue().newAnnouncements === 0 && ingested.length === 3,
  );

  const failing = post("a4");
  posts.set(a.childId, [...(posts.get(a.childId) ?? []), failing]);
  ingestFailsFor.add(failing.id);
  await sync(a);
  const [failedRow] = (await ledgerOf(a.childId)).filter(
    (row) => row.announcementId === failing.id,
  );
  await step(
    "a failed ingest rolls back the ingest's own writes",
    (await probeRows(failing.id)) === 0,
  );
  await step(
    "and records the announcement as failed once, outside that rollback",
    failedRow?.outcome === "failed" && failedRow.attempts === 1,
    failedRow,
  );

  ingestFailsFor.clear();
  await sync(a);
  const [retriedRow] = (await ledgerOf(a.childId)).filter(
    (row) => row.announcementId === failing.id,
  );
  await step(
    "the next sync retries it and records the second attempt",
    retriedRow?.outcome === "extracted" &&
      retriedRow.attempts === 2 &&
      (await probeRows(failing.id)) === 1,
    retriedRow,
  );

  await db
    .update(childAccount)
    .set({ status: "disconnecting", syncLease: 2 })
    .where(eq(childAccount.id, b.childId));
  const fenced = await sync(b);
  await step(
    "a child being disconnected gets no ledger row and no ingest",
    fenced.isFailure &&
      fenced.getError().code === "SYNC_LEASE_CONFLICT" &&
      (await ledgerOf(b.childId)).length === 0 &&
      !ingested.includes(`${probe}-b1`),
    fenced.isFailure ? fenced.getError() : fenced.getValue(),
  );

  await db.update(childAccount).set({ status: "connected" }).where(eq(childAccount.id, b.childId));
  await sync(b, 2);
  await step("the reconnected child syncs again", (await ledgerOf(b.childId)).length === 1);

  await db.delete(authSchema.user).where(eq(authSchema.user.id, a.userId));
  await step(
    "deleting a family erases its ledger through the child cascade",
    (await ledgerOf(a.childId)).length === 0,
  );
  await step("and leaves another family's ledger intact", (await ledgerOf(b.childId)).length === 1);
}, "the ledger is idempotent, fenced and erased with its child");
