/**
 * Proves against a real Postgres that the event history sweep applies the stated durations:
 * an event whose deadline is more than 12 months old leaves with its reminders, alerts and
 * deliveries; a deleted or withdrawn event leaves 30 days after, and a coursework one only once
 * its day is before the first day the sync reads, so a sync right after the sweep recreates
 * nothing, even for a deadline on that boundary day. A recent past deadline, a live event, a
 * recent deletion and a coursework deletion still inside the sync window stay. Each parent gets
 * one agenda.events_purged per pass with the count and no actor. The run leaves its heartbeat.
 */

import { exitUnlessLocalDatabase, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-event-retention", process.env.DATABASE_URL);

import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import { alert, alertDelivery } from "@modules/alerts/schemas/alert.schema";
import { alertEventReminders } from "@modules/alerts/schemas/reminder-settings.schema";
import { seedParentWithChild } from "@modules/children/schemas/testing/seed-child";
import { firstSyncedDay } from "@modules/classroom-sync/application/sync-lookback";
import { shiftInstant } from "@packages/ddd-kit/days";
import {
  and,
  authSchema,
  db,
  eq,
  inArray,
  like,
  outboxSchema,
  sweepSchema,
  TransactionService,
} from "@packages/drizzle";
import { EventTypes, PayloadByEventType } from "@packages/events";
import { di } from "../src/container";
import { logger } from "../src/shared/logger";
import { DrizzleSweepRunStore } from "../src/shared/services/drizzle-sweep-run.store";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";
import { EVENT_HISTORY_LABEL, sweepEventHistory } from "../src/workers/retention";
import { requireFakeProviders } from "./demo-family";

requireFakeProviders("check-event-retention");

const probe = `check-event-retention-${crypto.randomUUID()}`;
const instrumentation = new NoOpInstrumentation();
const now = new Date();
const daysAgo = (days: number) => shiftInstant(now, -days);

const ONE_MINUTE_DAYS = 1 / (24 * 60);

interface Probe {
  key: string;
  deadlineDaysAgo: number;
  deletedDaysAgo?: number;
  withdrawnDaysAgo?: number;
  source?: "announcement" | "manual";
}

const sourceOf = (p: Probe): "announcement" | "coursework" | "manual" => p.source ?? "coursework";

const PROBES: Probe[] = [
  { key: "past-13-months", deadlineDaysAgo: 400 },
  { key: "past-11-months", deadlineDaysAgo: 330 },
  { key: "live-past-lookback", deadlineDaysAgo: 70 },
  { key: "deleted-long-ago", deadlineDaysAgo: 70, deletedDaysAgo: 31 },
  { key: "withdrawn-long-ago", deadlineDaysAgo: 70, withdrawnDaysAgo: 31 },
  { key: "deleted-recently", deadlineDaysAgo: 70, deletedDaysAgo: 10 },
  { key: "deleted-inside-lookback", deadlineDaysAgo: 10, deletedDaysAgo: 31 },
  { key: "withdrawn-upcoming", deadlineDaysAgo: -20, withdrawnDaysAgo: 31 },
  { key: "deleted-on-sync-boundary", deadlineDaysAgo: 60 + ONE_MINUTE_DAYS, deletedDaysAgo: 31 },
  {
    key: "announcement-deleted-upcoming",
    deadlineDaysAgo: -20,
    deletedDaysAgo: 31,
    source: "announcement",
  },
  { key: "manual-deleted-upcoming", deadlineDaysAgo: -20, deletedDaysAgo: 31, source: "manual" },
];

const dayOf = (p: Probe) => daysAgo(p.deadlineDaysAgo).toISOString().slice(0, 10);

async function remaining(userId: string): Promise<string[]> {
  const rows = await db
    .select({ announcementId: agendaEvent.announcementId })
    .from(agendaEvent)
    .where(eq(agendaEvent.userId, userId));
  return rows.map((row) => row.announcementId).sort();
}

const { step, run } = stepRunner("check-event-retention", async () => {
  await db
    .delete(outboxSchema.outboxEvent)
    .where(like(outboxSchema.outboxEvent.aggregateId, `${probe}-%`));
  await db.delete(authSchema.user).where(like(authSchema.user.id, `${probe}-%`));
});

run(async () => {
  const userId = `${probe}-parent`;
  const childId = await seedParentWithChild({ userId, name: "parent", at: now });

  const events = await db
    .insert(agendaEvent)
    .values(
      PROBES.map((p) => ({
        userId,
        childId,
        source: sourceOf(p),
        announcementId: p.key,
        ordinal: 0,
        courseId: p.source === "manual" ? null : "course-1",
        announcementUrl: p.source === "manual" ? null : "https://classroom.google.com/c/course-1",
        title: p.key,
        description: "",
        category: "homework" as const,
        deadlineDate: dayOf(p),
        deadlineAt: daysAgo(p.deadlineDaysAgo),
        receivedAt: daysAgo(p.deadlineDaysAgo + 5),
        status: "confirmed" as const,
        deletedAt: p.deletedDaysAgo === undefined ? null : daysAgo(p.deletedDaysAgo),
        withdrawnAt: p.withdrawnDaysAgo === undefined ? null : daysAgo(p.withdrawnDaysAgo),
      })),
    )
    .returning({ id: agendaEvent.id, key: agendaEvent.announcementId });
  const oldest = events.find((event) => event.key === "past-13-months");
  if (!oldest) throw new Error("oldest event not seeded");

  await db.insert(alertEventReminders).values({
    eventId: oldest.id,
    userId,
    reminders: [{ kind: "hours_before", hours: 2 }],
    updatedAt: now,
  });
  const [sent] = await db
    .insert(alert)
    .values({
      userId,
      eventId: oldest.id,
      reminder: "h2",
      dueAt: daysAgo(400),
      deadlineAt: daysAgo(400),
      origin: "default",
      status: "sent",
      sentAt: daysAgo(400),
    })
    .returning({ id: alert.id });
  if (!sent) throw new Error("alert not seeded");
  await db
    .insert(alertDelivery)
    .values({ alertId: sent.id, channel: "push", outcome: "sent", at: daysAgo(400) });

  const swept = await sweepEventHistory({
    uow: new TransactionService(instrumentation, async () => {}),
    instrumentation,
    sweepRuns: new DrizzleSweepRunStore(instrumentation),
    outbox: di.IOutboxRepository,
    logger,
  });

  await step("the run took the lease and was not skipped", !swept.skipped, swept);
  await step(
    "past deadlines over 12 months and long dismissed events are purged, coursework only once the sync no longer reads its day",
    JSON.stringify(await remaining(userId)) ===
      JSON.stringify([
        "deleted-inside-lookback",
        "deleted-on-sync-boundary",
        "deleted-recently",
        "live-past-lookback",
        "past-11-months",
        "withdrawn-upcoming",
      ]),
    await remaining(userId),
  );

  const synced = PROBES.filter((p) => p.source === undefined && dayOf(p) >= firstSyncedDay(now));
  let recreated = 0;
  for (const p of synced) {
    const ingested = await di.IEventIngest.ingestCoursework({
      userId,
      childId,
      courseId: "course-1",
      items: [
        {
          id: p.key,
          title: p.key,
          url: "https://classroom.google.com/c/course-1",
          deadlineDate: dayOf(p),
          done: false,
        },
      ],
      complete: false,
      presentIds: [p.key],
    });
    if (ingested.isFailure) throw new Error(`ingest failed: ${ingested.getError().code}`);
    recreated += ingested.getValue().created;
  }
  await step(
    "a sync right after the sweep recreates none of the coursework it still reads, the boundary day included",
    recreated === 0 && synced.some((p) => p.key === "deleted-on-sync-boundary"),
    { recreated, synced: synced.map((p) => p.key) },
  );

  const purged = await db
    .select({ payload: outboxSchema.outboxEvent.payload })
    .from(outboxSchema.outboxEvent)
    .where(
      and(
        eq(outboxSchema.outboxEvent.eventType, EventTypes.EVENTS_PURGED),
        eq(outboxSchema.outboxEvent.aggregateId, userId),
      ),
    );
  const announced = purged
    .map(({ payload }) => PayloadByEventType[EventTypes.EVENTS_PURGED].safeParse(payload))
    .map((parsed) =>
      parsed.success
        ? `${parsed.data.userId} ${parsed.data.scope} ${parsed.data.count} ${parsed.data.reason} ${parsed.data.actorUserId}`
        : "unparsable",
    )
    .sort();
  await step(
    "the parent gets one events purged event per pass, with its count and no actor",
    JSON.stringify(announced) ===
      JSON.stringify([`${userId} dismissed 4 retention null`, `${userId} past 1 retention null`]),
    announced,
  );

  const reminders = await db
    .select()
    .from(alertEventReminders)
    .where(eq(alertEventReminders.eventId, oldest.id));
  const alerts = await db.select().from(alert).where(eq(alert.eventId, oldest.id));
  const deliveries = await db
    .select()
    .from(alertDelivery)
    .where(inArray(alertDelivery.alertId, [sent.id]));
  await step(
    "a purged event takes its reminders, alerts and deliveries with it",
    reminders.length === 0 && alerts.length === 0 && deliveries.length === 0,
    { reminders, alerts, deliveries },
  );

  const [beat] = await db
    .select()
    .from(sweepSchema.sweepRun)
    .where(eq(sweepSchema.sweepRun.label, EVENT_HISTORY_LABEL));
  await step("the run left its heartbeat", beat?.outcome === "ok", beat);
}, "the event history keeps 12 months of deadlines and 30 days of dismissed events on a real database");
