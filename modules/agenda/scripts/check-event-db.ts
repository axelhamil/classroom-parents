/**
 * Proves against a real Postgres what mocked ports cannot: 20 concurrent ingests of one
 * announcement create its events once, a parent edit or deletion survives a later ingest,
 * upcoming and history split on the deadline instant with their filters and keyset cursors,
 * a turned-in coursework leaves upcoming, the status filter isolates the events to review,
 * a family never reads, edits, confirms or deletes another family's event, deleting a user
 * cascades its events, a coursework is stored once and follows its teacher until the parent edits
 * the field, an announcement deadline on a coursework's course and day stays hidden only while a
 * live coursework matches, a complete listing retires a coursework the teacher removed while
 * an archived course keeps its past coursework in the history, the user cascade on event reads
 * event_user_deadline_idx, and listUpcoming on 10 000 rows uses event_user_deadline_idx and
 * event_coursework_day_idx.
 */

import { exitUnlessLocalDatabase, spanRecorder, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-event-db", process.env.DATABASE_URL);

import { childAccount } from "@modules/children/schemas/child.schema";
import { seedChild } from "@modules/children/schemas/testing/seed-child";
import { type AppError, Result } from "@packages/ddd-kit";
import {
  and,
  authSchema,
  db,
  eq,
  inArray,
  like,
  outboxSchema,
  TransactionService,
} from "@packages/drizzle";
import { DrizzleOutboxRepository } from "@packages/outbox/drizzle-outbox.repository";
import { agendaEvent } from "../schemas/event.schema";
import type { EventPageDto } from "../src/application/dto/event.dto";
import type { IAlertPlanner, PlannedDeadline } from "../src/application/ports/alert-planner.port";
import type { IChildOwnership } from "../src/application/ports/child-ownership.port";
import type { EventFilter } from "../src/application/ports/event-repository.port";
import { EventEditService } from "../src/application/services/event-edit.service";
import {
  EventIngestService,
  type IngestedCoursework,
  type IngestedEvent,
} from "../src/application/services/event-ingest.service";
import { EventQueryService } from "../src/application/services/event-query.service";
import { DrizzleEventRepository } from "../src/infrastructure/repositories/drizzle-event.repository";

const NOW = new Date("2030-01-15T09:00:00.000Z");
const SEEDED = 10_000;
const probe = `check-event-db-${crypto.randomUUID()}`;
const { instrumentation, spans } = spanRecorder();

const planned: PlannedDeadline[] = [];
const cancelled: string[] = [];
const planner: IAlertPlanner = {
  planDefault: async (deadline) => {
    planned.push(deadline);
    return Result.ok<AppError>();
  },
  replan: async () => Result.ok<AppError>(),
  cancel: async (eventId, _actorUserId) => {
    cancelled.push(eventId);
    return Result.ok<AppError>();
  },
};

const children: IChildOwnership = {
  isOwnedBy: async (userId, childId) => {
    const rows = await db
      .select({ id: childAccount.id })
      .from(childAccount)
      .where(and(eq(childAccount.id, childId), eq(childAccount.userId, userId)));
    return Result.ok<boolean, AppError>(rows.length === 1);
  },
};

const outbox = new DrizzleOutboxRepository(instrumentation, () => undefined);
const transactions = new TransactionService(instrumentation, async (events) => {
  await outbox.enqueue(events, { source: "check-event-db" });
});
const repository = new DrizzleEventRepository(instrumentation);
const ingestService = new EventIngestService(
  repository,
  children,
  planner,
  transactions,
  outbox,
  instrumentation,
  () => NOW,
);
const edits = new EventEditService(
  repository,
  planner,
  transactions,
  outbox,
  instrumentation,
  () => NOW,
);
const query = new EventQueryService(repository, instrumentation);

async function createUser(name: string): Promise<string> {
  const id = `${probe}-${name}`;
  await db.insert(authSchema.user).values({ id, name, email: `${id}@example.com` });
  return id;
}

function createChild(userId: string, name: string): Promise<string> {
  return seedChild({ userId, name, at: NOW });
}

function extracted(overrides: Partial<IngestedEvent> = {}): IngestedEvent {
  return {
    title: "Contrôle de maths",
    description: "Chapitre 3",
    category: "assessment",
    deadlineDate: "2030-01-20",
    needsReview: false,
    ...overrides,
  };
}

function ingest(userId: string, childId: string, announcementId: string, events: IngestedEvent[]) {
  return ingestService.ingest({
    userId,
    childId,
    announcement: {
      id: announcementId,
      courseId: "course-1",
      url: `https://classroom.google.com/c/course-1/p/${announcementId}`,
      publishedAt: NOW,
    },
    events,
  });
}

function homework(overrides: Partial<IngestedCoursework> = {}): IngestedCoursework {
  return {
    id: "w-mia",
    title: "Exposé sur les volcans",
    url: "https://classroom.google.com/c/course-1/a/w-mia",
    deadlineDate: "2030-01-22",
    done: false,
    ...overrides,
  };
}

function ingestCoursework(
  userId: string,
  childId: string,
  items: IngestedCoursework[],
  listing: { complete: boolean; presentIds?: string[] } = { complete: true },
) {
  return ingestService.ingestCoursework({
    userId,
    childId,
    courseId: "course-1",
    items,
    complete: listing.complete,
    presentIds: listing.presentIds ?? items.map(({ id }) => id),
  });
}

async function rowsOf(childId: string, announcementId: string) {
  return db
    .select()
    .from(agendaEvent)
    .where(eq(agendaEvent.childId, childId))
    .then((rows) => rows.filter((row) => row.announcementId === announcementId));
}

const idsOf = (page: Result<EventPageDto, AppError>) =>
  page.isSuccess ? page.getValue().items.map((item) => item.id) : ["failed"];

async function alertable(userId: string, eventId: string): Promise<string> {
  const read = await query.alertDeadline(userId, eventId);
  if (read.isFailure) return "failed";
  return read
    .getValue()
    .map((deadline) => deadline.deadlineDate)
    .unwrapOr("none");
}

const codeOf = (result: Result<unknown, AppError>) =>
  result.isFailure ? result.getError().code : "ok";

async function walk(
  list: (filter: EventFilter) => Promise<Result<EventPageDto, AppError>>,
): Promise<string[]> {
  const seen: string[] = [];
  let cursor: EventFilter["cursor"];
  for (let page = 0; page < 50; page += 1) {
    const result = await list({ limit: 1, cursor });
    if (result.isFailure) return ["failed"];
    seen.push(...result.getValue().items.map((item) => item.id));
    const next = result.getValue().nextCursor;
    if (next === undefined) return seen;
    const cut = next.indexOf("~");
    cursor = { at: next.slice(0, cut), id: next.slice(cut + 1) };
  }
  return ["no end"];
}

async function cleanup(): Promise<void> {
  const users = await db
    .select({ id: authSchema.user.id })
    .from(authSchema.user)
    .where(like(authSchema.user.id, `${probe}%`));
  const userIds = users.map(({ id }) => id);
  if (userIds.length > 0) {
    const events = await db
      .select({ id: agendaEvent.id })
      .from(agendaEvent)
      .where(inArray(agendaEvent.userId, userIds));
    const eventIds = events.map(({ id }) => id);
    for (let start = 0; start < eventIds.length; start += 1000)
      await db
        .delete(outboxSchema.outboxEvent)
        .where(inArray(outboxSchema.outboxEvent.aggregateId, eventIds.slice(start, start + 1000)));
  }
  await db.delete(authSchema.user).where(like(authSchema.user.id, `${probe}%`));
}

async function explainRolledBack(statement: string, values: unknown[]): Promise<string> {
  const client = await db.$client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL enable_seqscan = off");
    const plan = await client.query(statement, values);
    return plan.rows.map((row: Record<string, string>) => Object.values(row).join("")).join("\n");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

const { step, run } = stepRunner("check-event-db", cleanup);

run(async () => {
  const a = await createUser("a");
  const b = await createUser("b");
  const aLea = await createChild(a, "lea");
  const aTom = await createChild(a, "tom");
  const bZoe = await createChild(b, "zoe");

  const pair = [extracted(), extracted({ title: "Sortie au musée", category: "school_trip" })];
  const raced = await Promise.all(
    Array.from({ length: 20 }, () => ingest(a, aLea, "ann-race", pair)),
  );
  const created = raced.reduce((sum, r) => sum + (r.isSuccess ? r.getValue().created : 0), 0);
  const racedRows = await rowsOf(aLea, "ann-race");
  await step(
    "20 concurrent ingests of one announcement create its 2 events exactly once",
    raced.every((r) => r.isSuccess) && created === 2 && racedRows.length === 2,
    { created, rows: racedRows.length, failures: raced.filter((r) => r.isFailure).length },
  );
  const createdEvents = await db
    .select()
    .from(outboxSchema.outboxEvent)
    .where(
      inArray(
        outboxSchema.outboxEvent.aggregateId,
        racedRows.map((row) => row.id),
      ),
    );
  await step(
    "EVENT_CREATED is committed once per created event",
    createdEvents.filter((e) => e.eventType === "agenda.event.created").length === 2,
  );

  const exam = racedRows.find((row) => row.ordinal === 0);
  const trip = racedRows.find((row) => row.ordinal === 1);
  if (!exam || !trip) throw new Error("ingested rows missing");
  await edits.edit(a, exam.id, { title: "Contrôle de maths (titre du parent)" });
  await edits.remove(a, trip.id);
  const again = await ingest(a, aLea, "ann-race", [
    extracted({ title: "Titre corrigé par le professeur" }),
    extracted({ title: "Sortie au musée", category: "school_trip" }),
  ]);
  const afterAgain = await rowsOf(aLea, "ann-race");
  await step(
    "a re-ingest keeps the parent's title and never recreates the deleted event",
    again.isSuccess &&
      again.getValue().created === 0 &&
      afterAgain.length === 2 &&
      afterAgain.find((row) => row.id === exam.id)?.title ===
        "Contrôle de maths (titre du parent)" &&
      afterAgain.find((row) => row.id === trip.id)?.deletedAt !== null,
  );
  await step(
    "a deleted event is gone from get, upcoming and history, its alert cancelled",
    (await query.get(a, trip.id)).getValue().isNone() &&
      !idsOf(await query.listUpcoming(a, { limit: 100 }, NOW)).includes(trip.id) &&
      !idsOf(await query.listHistory(a, { limit: 100 }, NOW)).includes(trip.id) &&
      cancelled.includes(trip.id) &&
      codeOf(await edits.remove(a, trip.id)) === "EVENT_NOT_FOUND",
  );

  await ingest(a, aTom, "ann-split", [
    extracted({ title: "Demain", deadlineDate: "2030-01-16" }),
    extracted({ title: "Ce matin", deadlineDate: "2030-01-15", deadlineTime: "08:00" }),
    extracted({ title: "Hier", deadlineDate: "2030-01-14", category: "homework" }),
  ]);
  const split = await rowsOf(aTom, "ann-split");
  const idOf = (title: string) => split.find((row) => row.title === title)?.id ?? "";
  await step(
    "with now 10:00 Paris, upcoming holds tomorrow, history holds this morning then yesterday",
    idsOf(await query.listUpcoming(a, { childIds: [aTom], limit: 10 }, NOW)).join() ===
      idOf("Demain") &&
      idsOf(await query.listHistory(a, { childIds: [aTom], limit: 10 }, NOW)).join() ===
        [idOf("Ce matin"), idOf("Hier")].join(),
  );
  await step(
    "category and child filters narrow the list",
    idsOf(await query.listHistory(a, { categories: ["homework"], limit: 10 }, NOW)).join() ===
      idOf("Hier") &&
      idsOf(await query.listUpcoming(a, { childIds: [aLea], limit: 10 }, NOW)).join() === exam.id,
  );

  await ingest(a, aTom, "ann-more", [
    extracted({ title: "Piscine", category: "swimming", deadlineDate: "2030-01-16" }),
    extracted({ title: "Autorisation", category: "document_due", deadlineDate: "2030-02-01" }),
    extracted({ title: "Exposé", deadlineDate: "2030-01-10", deadlineTime: "14:00" }),
  ]);
  const fullUpcoming = idsOf(await query.listUpcoming(a, { limit: 100 }, NOW));
  const fullHistory = idsOf(await query.listHistory(a, { limit: 100 }, NOW));
  const pagedUpcoming = await walk((filter) => query.listUpcoming(a, filter, NOW));
  const pagedHistory = await walk((filter) => query.listHistory(a, filter, NOW));
  await step(
    "paging one by one with the cursor walks both lists in order, without gap or repeat",
    pagedUpcoming.join() === fullUpcoming.join() &&
      pagedHistory.join() === fullHistory.join() &&
      fullUpcoming.length === 4 &&
      fullHistory.length === 3,
    { upcoming: pagedUpcoming.length, history: pagedHistory.length },
  );

  const aMia = await createChild(a, "mia");
  await ingest(a, aMia, "ann-mia", [
    extracted({ title: "Exposé annoncé", category: "homework", deadlineDate: "2030-01-22" }),
  ]);
  const [announced] = await rowsOf(aMia, "ann-mia");
  const racedCoursework = await Promise.all(
    Array.from({ length: 10 }, () => ingestCoursework(a, aMia, [homework()])),
  );
  const [miaWork] = await rowsOf(aMia, "w-mia");
  if (!announced || !miaWork) throw new Error("mia rows missing");
  await step(
    "10 concurrent coursework ingests store the coursework once",
    racedCoursework.every((r) => r.isSuccess) &&
      (await rowsOf(aMia, "w-mia")).length === 1 &&
      miaWork.source === "coursework",
  );
  await step(
    "an announcement deadline on a coursework's course and day is hidden from the lists",
    idsOf(await query.listUpcoming(a, { childIds: [aMia], limit: 10 }, NOW)).join() === miaWork.id,
  );
  await step(
    "alerts read no deadline for the hidden announcement, only for the coursework of its day",
    (await alertable(a, announced.id)) === "none" &&
      (await alertable(a, miaWork.id)) === "2030-01-22",
  );
  await ingestCoursework(a, aMia, [homework({ deadlineDate: "2030-01-23" })]);
  await step(
    "once the teacher moves the coursework, it follows and the announcement deadline reappears",
    (await rowsOf(aMia, "w-mia"))[0]?.deadlineDate === "2030-01-23" &&
      idsOf(await query.listUpcoming(a, { childIds: [aMia], limit: 10 }, NOW)).join() ===
        [announced.id, miaWork.id].join(),
  );
  await edits.edit(a, miaWork.id, { deadlineDate: "2030-01-24" });
  await ingestCoursework(a, aMia, [homework({ deadlineDate: "2030-01-25", done: true })]);
  const [kept] = await rowsOf(aMia, "w-mia");
  await step(
    "after a parent edit the teacher's date is ignored, the done state still follows",
    kept?.deadlineDate === "2030-01-24" && kept.done && cancelled.includes(miaWork.id),
  );

  const aNoe = await createChild(a, "noe");
  await ingest(a, aNoe, "ann-noe", [
    extracted({ title: "Contrôle du 26", deadlineDate: "2030-01-26" }),
    extracted({ title: "Contrôle du 27", deadlineDate: "2030-01-27" }),
  ]);
  const noeWork = [
    homework({ id: "w-noe-26", deadlineDate: "2030-01-26", done: true }),
    homework({ id: "w-noe-27", deadlineDate: "2030-01-27" }),
  ];
  await ingestCoursework(a, aNoe, noeWork);
  const [ann26, ann27] = (await rowsOf(aNoe, "ann-noe")).sort((x, y) => x.ordinal - y.ordinal);
  const [w26] = await rowsOf(aNoe, "w-noe-26");
  const [w27] = await rowsOf(aNoe, "w-noe-27");
  if (!ann26 || !ann27 || !w26 || !w27) throw new Error("noe rows missing");
  const noeUpcoming = async () =>
    idsOf(await query.listUpcoming(a, { childIds: [aNoe], limit: 10 }, NOW))
      .sort()
      .join();
  const sameIds = (...ids: string[]) => ids.sort().join();
  await step(
    "a turned-in coursework leaves the upcoming list and still hides its day's announcement",
    (await noeUpcoming()) === sameIds(w27.id),
  );
  await edits.remove(a, w26.id);
  await step(
    "once the parent deletes the coursework, the announcement deadline of its day reappears",
    (await noeUpcoming()) === sameIds(ann26.id, w27.id),
  );
  await step(
    "alerts read no deadline for a deleted coursework, and again for the announcement it hid",
    (await alertable(a, w26.id)) === "none" && (await alertable(a, ann26.id)) === "2030-01-26",
  );
  await step(
    "the announcement a deleted coursework hid gets its alert planned, the parent as actor",
    planned.some(({ eventId, actorUserId }) => eventId === ann26.id && actorUserId === a),
  );
  await ingestCoursework(a, aNoe, [], { complete: false, presentIds: [] });
  await step(
    "a partial listing without the coursework withdraws nothing",
    (await rowsOf(aNoe, "w-noe-27"))[0]?.withdrawnAt === null &&
      (await noeUpcoming()) === sameIds(ann26.id, w27.id),
  );
  await ingestCoursework(a, aNoe, [], { complete: true, presentIds: [] });
  const [withdrawn27] = await rowsOf(aNoe, "w-noe-27");
  await step(
    "a complete listing without the coursework withdraws it and its announcement deadline reappears",
    withdrawn27?.withdrawnAt !== null &&
      withdrawn27?.deletedAt === null &&
      cancelled.includes(w27.id) &&
      (await noeUpcoming()) === sameIds(ann26.id, ann27.id),
  );
  await step(
    "alerts read no deadline for a withdrawn coursework, and again for the announcement it hid",
    (await alertable(a, w27.id)) === "none" && (await alertable(a, ann27.id)) === "2030-01-27",
  );
  await step(
    "the announcement a withdrawn coursework hid gets its alert planned by the system",
    planned.some(({ eventId, actorUserId }) => eventId === ann27.id && actorUserId === null),
  );
  await ingestCoursework(a, aNoe, [homework({ id: "w-noe-27", deadlineDate: "2030-01-27" })]);
  await step(
    "a withdrawn coursework listed and dated again comes back and hides its day's announcement",
    (await rowsOf(aNoe, "w-noe-27"))[0]?.withdrawnAt === null &&
      (await noeUpcoming()) === sameIds(ann26.id, w27.id),
  );
  await step(
    "once the withdrawal is lifted, alerts read the coursework deadline again and not the announcement",
    (await alertable(a, w27.id)) === "2030-01-27" && (await alertable(a, ann27.id)) === "none",
  );
  await ingestCoursework(a, aNoe, [
    homework({ id: "w-noe-27", deadlineDate: "2030-01-27" }),
    homework({ id: "w-noe-past", deadlineDate: "2030-01-05" }),
  ]);
  const [noePast] = await rowsOf(aNoe, "w-noe-past");
  if (!noePast) throw new Error("noe past coursework missing");
  await ingestService.withdrawCourseworkOutside({
    userId: a,
    childId: aNoe,
    activeCourseIds: ["course-2"],
  });
  await step(
    "the coursework of a course no longer listed is withdrawn and its announcement reappears",
    (await rowsOf(aNoe, "w-noe-27"))[0]?.withdrawnAt !== null &&
      (await noeUpcoming()) === sameIds(ann26.id, ann27.id),
  );
  await step(
    "the past coursework of an archived course stays in the history",
    (await rowsOf(aNoe, "w-noe-past"))[0]?.withdrawnAt === null &&
      idsOf(await query.listHistory(a, { childIds: [aNoe], limit: 10 }, NOW)).includes(noePast.id),
  );

  const stolen = await ingest(a, bZoe, "ann-stolen", [extracted()]);
  await step(
    "an ingest pairing a parent with another family's child is refused and writes nothing",
    codeOf(stolen) === "EVENT_CHILD_NOT_FOUND" && (await rowsOf(bZoe, "ann-stolen")).length === 0,
  );

  const unblocked = await db.transaction(async (tx) => {
    await tx.select().from(agendaEvent).where(eq(agendaEvent.id, exam.id)).for("update");
    const timer = new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 1500));
    return Promise.race([query.get(a, exam.id).then(() => "read" as const), timer]);
  });
  await step("reading an event is never blocked by a write holding its row", unblocked === "read");

  await ingest(b, bZoe, "ann-b", [extracted({ title: "Événement de B", needsReview: true })]);
  const [bEvent] = await rowsOf(bZoe, "ann-b");
  if (!bEvent) throw new Error("B event missing");
  await step(
    "A cannot get, edit, confirm or delete B's event, which stays as it was",
    (await query.get(a, bEvent.id)).getValue().isNone() &&
      codeOf(await edits.edit(a, bEvent.id, { title: "Pirate" })) === "EVENT_NOT_FOUND" &&
      codeOf(await edits.confirm(a, bEvent.id)) === "EVENT_NOT_FOUND" &&
      codeOf(await edits.remove(a, bEvent.id)) === "EVENT_NOT_FOUND" &&
      (await rowsOf(bZoe, "ann-b"))[0]?.title === "Événement de B" &&
      (await rowsOf(bZoe, "ann-b"))[0]?.deletedAt === null,
  );
  await step(
    "A reads no alert deadline of B's event, B reads it",
    (await alertable(a, bEvent.id)) === "none" && (await alertable(b, bEvent.id)) === "2030-01-20",
  );
  await step(
    "A's lists never show B's event, B's lists show only it",
    !fullUpcoming.includes(bEvent.id) &&
      idsOf(await query.listUpcoming(b, { limit: 100 }, NOW)).join() === bEvent.id &&
      idsOf(await query.listHistory(b, { limit: 100 }, NOW)).length === 0 &&
      idsOf(await query.listUpcoming(a, { childIds: [bZoe], limit: 100 }, NOW)).length === 0,
  );
  await step(
    "the status filter lists only the events to review, wherever they sit in the list",
    idsOf(await query.listUpcoming(b, { statuses: ["needs_review"], limit: 1 }, NOW)).join() ===
      bEvent.id &&
      idsOf(await query.listUpcoming(b, { statuses: ["confirmed"], limit: 100 }, NOW)).length === 0,
  );
  await step(
    "an event to review gets no alert until its parent confirms it",
    !planned.some((p) => p.eventId === bEvent.id) &&
      (await edits.confirm(b, bEvent.id)).getValue().status === "confirmed" &&
      planned.filter((p) => p.eventId === bEvent.id).length === 1,
  );

  const cascadePlan = await explainRolledBack(
    `EXPLAIN (ANALYZE, BUFFERS) DELETE FROM ONLY "event" WHERE $1 = "user_id"`,
    [b],
  );
  console.log(`\nEXPLAIN ANALYZE of the user cascade on event:\n${cascadePlan}\n`);
  await step(
    "the user cascade on event, deleted rows included, reads event_user_deadline_idx",
    cascadePlan.includes("event_user_deadline_idx") && !cascadePlan.includes("Seq Scan"),
  );

  await db.delete(authSchema.user).where(eq(authSchema.user.id, b));
  await step(
    "deleting a user cascades its events",
    (await db.select().from(agendaEvent).where(eq(agendaEvent.userId, b))).length === 0,
  );

  const c = await createUser("c");
  const cChild = await createChild(c, "max");
  const start = Date.UTC(2029, 0, 1);
  const seeded = Array.from({ length: SEEDED }, (_, i) => {
    const at = new Date(start + i * 3_600_000);
    return {
      userId: c,
      childId: cChild,
      source: i % 2 === 0 ? ("coursework" as const) : ("announcement" as const),
      announcementId: `seed-${i}`,
      ordinal: 0,
      courseId: i % 2 === 0 ? "course-seed-work" : "course-seed",
      announcementUrl: "https://classroom.google.com/c/seed",
      title: `Seed ${i}`,
      description: "",
      category: "homework" as const,
      deadlineDate: at.toISOString().slice(0, 10),
      deadlineAt: at,
      receivedAt: NOW,
      status: "confirmed" as const,
    };
  });
  for (let i = 0; i < seeded.length; i += 1000)
    await db.insert(agendaEvent).values(seeded.slice(i, i + 1000));
  await db.$client.query("ANALYZE event");

  spans.length = 0;
  const cPage = await query.listUpcoming(c, { limit: 30 }, NOW);
  const listSql = spans.at(-1) ?? "";
  const plan = await db.$client.query(`EXPLAIN (ANALYZE, BUFFERS) ${listSql}`, [
    c,
    NOW.toISOString(),
    31,
  ]);
  const planText = plan.rows
    .map((row: Record<string, string>) => Object.values(row).join(""))
    .join("\n");
  console.log(`\nEXPLAIN ANALYZE listUpcoming on ${SEEDED} rows:\n${listSql}\n${planText}\n`);
  await step(
    `listUpcoming on ${SEEDED} rows reads event_user_deadline_idx`,
    cPage.isSuccess &&
      cPage.getValue().items.length === 30 &&
      listSql.includes("$3") &&
      !listSql.includes("$4") &&
      planText.includes("event_user_deadline_idx") &&
      planText.includes("event_coursework_day_idx"),
  );
}, "agenda events stay inside their family and survive re-ingest on a real database");
