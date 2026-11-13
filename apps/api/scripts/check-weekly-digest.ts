/**
 * Proves the Sunday digest against a real Postgres, with FAKE_PROVIDERS standing in for web push.
 * On the Sunday the clocks go back, four instances racing over the same parents send each
 * eligible parent exactly one digest (the unique parent and week key plus FOR UPDATE SKIP LOCKED
 * and the lease), a second pass sends nothing more, nothing is planned before 18:00 Paris, the
 * audience query leaves out a parent who opted out and one whose only deadlines are to review,
 * done, outside the Monday to Sunday week, on a child being disconnected or shadowed by the
 * coursework of their day (the agenda's own alertable rule), and deleting the account removes its
 * digests and its preference.
 */

import { exitUnlessLocalDatabase, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-weekly-digest", process.env.DATABASE_URL);

import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import { pushSubscription } from "@modules/alerts/schemas/push-subscription.schema";
import {
  alertDigestPreference,
  alertWeeklyDigest,
} from "@modules/alerts/schemas/weekly-digest.schema";
import { childAccount } from "@modules/children/schemas/child.schema";
import { seedParentWithChild } from "@modules/children/schemas/testing/seed-child";
import { PARIS_TIME_ZONE, zonedWallTimeToUtc } from "@packages/ddd-kit/zoned-time";
import { and, authSchema, count, db, eq, inArray, like, outboxSchema } from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { di } from "../src/container";
import { requireFakeProviders } from "./demo-family";

requireFakeProviders("check-weekly-digest");

const ELIGIBLE = 30;
const INSTANCES = 4;
const probe = `check-weekly-digest-${crypto.randomUUID()}`;

function paris(date: string, time: string): Date {
  return zonedWallTimeToUtc(date, time, PARIS_TIME_ZONE).unwrapOr(new Date(Number.NaN));
}

const SUNDAY = "2030-10-27";
const BEFORE_SIX = paris(SUNDAY, "17:59");
const EVENING = paris(SUNDAY, "18:05");
const WEEK_START = "2030-10-28";

interface DeadlineSeed {
  date: string;
  time: string;
  status?: "confirmed" | "needs_review";
  done?: boolean;
  kind?: "announcement" | "coursework";
}

async function family(name: string, deadlines: DeadlineSeed[]): Promise<string> {
  const userId = `${probe}-${name}`;
  const childId = await seedParentWithChild({ userId, name, at: EVENING, label: `Enfant ${name}` });
  await db.insert(pushSubscription).values({
    userId,
    endpoint: `https://fcm.googleapis.com/fcm/send/${userId}`,
    p256dh: "p256dh",
    auth: "auth",
  });
  for (const [ordinal, deadline] of deadlines.entries())
    await db.insert(agendaEvent).values({
      userId,
      childId,
      announcementId: `announcement-${name}`,
      ordinal,
      courseId: "course-1",
      announcementUrl: "https://classroom.google.com/c/course-1",
      title: `Devoir ${ordinal}`,
      description: "",
      category: "homework",
      deadlineDate: deadline.date,
      deadlineTime: deadline.time,
      deadlineAt: paris(deadline.date, deadline.time),
      receivedAt: EVENING,
      status: deadline.status ?? "confirmed",
      done: deadline.done ?? false,
      source: deadline.kind ?? "announcement",
    });

  return userId;
}

function pushesTo(userId: string): number {
  const endpoint = `https://fcm.googleapis.com/fcm/send/${userId}`;
  return di.FakeProviders.unwrap()
    .pushed()
    .filter((push) => push.endpoint === endpoint && push.message.title === "Votre semaine").length;
}

async function drainAsOneInstance(at: Date): Promise<void> {
  for (;;) {
    const tick = await di.WeeklyDigestService.runOnce(at);
    if (tick.isFailure) throw new Error(`runOnce failed: ${tick.getError().code}`);
    if (tick.getValue().planned === 0 && tick.getValue().claimed === 0) return;
  }
}

async function probeUserIds(): Promise<string[]> {
  const rows = await db
    .select({ id: authSchema.user.id })
    .from(authSchema.user)
    .where(like(authSchema.user.id, `${probe}%`));
  return rows.map(({ id }) => id);
}

async function removeProbe(): Promise<void> {
  const ids = await probeUserIds();
  if (ids.length === 0) return;

  const digests = await db
    .select({ id: alertWeeklyDigest.id })
    .from(alertWeeklyDigest)
    .where(inArray(alertWeeklyDigest.userId, ids));
  if (digests.length > 0)
    await db.delete(outboxSchema.outboxEvent).where(
      inArray(
        outboxSchema.outboxEvent.aggregateId,
        digests.map(({ id }) => id),
      ),
    );
  await db.delete(authSchema.user).where(inArray(authSchema.user.id, ids));
}

const { step, run } = stepRunner("check-weekly-digest", removeProbe);

run(async () => {
  const eligible: string[] = [];
  for (let index = 0; index < ELIGIBLE; index += 1)
    eligible.push(
      await family(`eligible${index}`, [
        { date: WEEK_START, time: "00:00" },
        { date: "2030-11-01", time: "08:30" },
      ]),
    );

  const optedOut = await family("optedout", [{ date: "2030-10-29", time: "08:00" }]);
  await db.insert(alertDigestPreference).values({
    userId: optedOut,
    enabled: false,
    updatedAt: EVENING,
  });
  const ineligible = [
    optedOut,
    await family("review", [{ date: "2030-10-29", time: "08:00", status: "needs_review" }]),
    await family("done", [{ date: "2030-10-29", time: "08:00", done: true }]),
    await family("shadowed", [
      { date: "2030-10-29", time: "08:00" },
      { date: "2030-10-29", time: "08:00", kind: "coursework", done: true },
    ]),
    await family("outside", [
      { date: SUNDAY, time: "23:59" },
      { date: "2030-11-04", time: "00:00" },
    ]),
  ];
  const leaving = await family("leaving", [{ date: "2030-10-29", time: "08:00" }]);
  await db
    .update(childAccount)
    .set({ status: "disconnecting" })
    .where(eq(childAccount.userId, leaving));
  ineligible.push(leaving);

  await drainAsOneInstance(BEFORE_SIX);
  const [early] = await db
    .select({ total: count() })
    .from(alertWeeklyDigest)
    .where(like(alertWeeklyDigest.userId, `${probe}%`));
  await step("nothing is planned on Sunday before 18:00 Paris", early?.total === 0, early);

  await Promise.all(Array.from({ length: INSTANCES }, () => drainAsOneInstance(EVENING)));

  const counts = eligible.map(pushesTo);
  await step(
    `${INSTANCES} racing instances push each of the ${ELIGIBLE} eligible parents exactly once`,
    counts.every((total) => total === 1),
    counts,
  );
  const ignored = ineligible.map(pushesTo);
  await step(
    "no digest reaches an opted out parent nor one without a confirmed deadline this week",
    ignored.every((total) => total === 0),
    ignored,
  );

  const rows = await db
    .select({ id: alertWeeklyDigest.id, status: alertWeeklyDigest.status })
    .from(alertWeeklyDigest)
    .where(like(alertWeeklyDigest.userId, `${probe}%`));
  await step(
    "one sent digest row per eligible parent for the week, none for the others",
    rows.length === ELIGIBLE && rows.every(({ status }) => status === "sent"),
    rows.length,
  );

  const [sentEvents] = await db
    .select({ total: count() })
    .from(outboxSchema.outboxEvent)
    .where(
      and(
        eq(outboxSchema.outboxEvent.eventType, EventTypes.WEEKLY_DIGEST_SENT),
        inArray(
          outboxSchema.outboxEvent.aggregateId,
          rows.map(({ id }) => id),
        ),
      ),
    );
  await step("one digest sent event per parent", sentEvents?.total === ELIGIBLE, sentEvents);

  await Promise.all(Array.from({ length: INSTANCES }, () => drainAsOneInstance(EVENING)));
  await step(
    "a second pass the same evening sends nothing more",
    eligible.map(pushesTo).every((total) => total === 1),
  );

  const [planned] = await db
    .select({ week: alertWeeklyDigest.weekStart })
    .from(alertWeeklyDigest)
    .where(eq(alertWeeklyDigest.userId, eligible[0] ?? ""));
  await step("the digest is keyed on the coming Monday", planned?.week === WEEK_START, planned);

  await removeProbe();
  const [left] = await db
    .select({ total: count() })
    .from(alertWeeklyDigest)
    .where(like(alertWeeklyDigest.userId, `${probe}%`));
  const [preferences] = await db
    .select({ total: count() })
    .from(alertDigestPreference)
    .where(like(alertDigestPreference.userId, `${probe}%`));
  await step(
    "deleting the accounts removes their digests and preference",
    left?.total === 0 && preferences?.total === 0,
    { left, preferences },
  );
}, "the Sunday digest reaches each parent once");
