/**
 * Proves against a real Postgres that the host query timing a child's next sync reads the
 * earliest pending alert of that parent on that child only: a sibling's alert, a sent alert,
 * an alert before the lead and an alert forged onto another family's event never count.
 */

import { exitUnlessLocalDatabase, spanRecorder, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-upcoming-alerts", process.env.DATABASE_URL);

import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import { alert } from "@modules/alerts/schemas/alert.schema";
import { seedChild, seedParentWithChild } from "@modules/children/schemas/testing/seed-child";
import { authSchema, db, like } from "@packages/drizzle";
import { UpcomingAlertsQuery } from "../src/queries/upcoming-alerts.query";

const NOW = new Date("2030-01-15T09:00:00.000Z");
const AFTER = new Date(NOW.getTime() + 30 * 60_000);
const probe = `check-upcoming-alerts-${crypto.randomUUID()}`;
const { instrumentation, spans } = spanRecorder();
const query = new UpcomingAlertsQuery(instrumentation);

const inMinutes = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

async function eventOf(userId: string, childId: string, name: string): Promise<string> {
  const [event] = await db
    .insert(agendaEvent)
    .values({
      userId,
      childId,
      announcementId: `announcement-${name}`,
      ordinal: 0,
      courseId: "course-1",
      announcementUrl: "https://classroom.google.com/c/course-1",
      title: `Contrôle ${name}`,
      description: `Contrôle ${name}`,
      category: "assessment",
      deadlineDate: "2030-01-20",
      deadlineAt: inMinutes(5 * 24 * 60),
      receivedAt: NOW,
      status: "confirmed",
    })
    .returning({ id: agendaEvent.id });
  if (!event) throw new Error(`event of ${name} not created`);

  return event.id;
}

async function alertOn(
  userId: string,
  eventId: string,
  reminder: string,
  dueAt: Date,
  status: "pending" | "sent" = "pending",
): Promise<void> {
  await db.insert(alert).values({
    userId,
    eventId,
    reminder,
    dueAt,
    deadlineAt: inMinutes(5 * 24 * 60),
    origin: "default",
    status,
  });
}

async function cleanup(): Promise<void> {
  await db.delete(authSchema.user).where(like(authSchema.user.id, `${probe}-%`));
}

const { step, run } = stepRunner("check-upcoming-alerts", cleanup);

run(async () => {
  const parentA = `${probe}-a`;
  const parentB = `${probe}-b`;
  const lea = await seedParentWithChild({ userId: parentA, name: "lea", at: NOW });
  const tom = await seedChild({ userId: parentA, name: "tom", at: NOW });
  const zoe = await seedParentWithChild({ userId: parentB, name: "zoe", at: NOW });
  const leaEvent = await eventOf(parentA, lea, "lea");
  const tomEvent = await eventOf(parentA, tom, "tom");
  const zoeEvent = await eventOf(parentB, zoe, "zoe");

  await alertOn(parentA, leaEvent, "h1", inMinutes(20));
  await alertOn(parentA, leaEvent, "h2", inMinutes(40), "sent");
  await alertOn(parentA, leaEvent, "h3", inMinutes(60));
  await alertOn(parentA, leaEvent, "h4", inMinutes(120));
  await alertOn(parentA, tomEvent, "h1", inMinutes(35));
  await alertOn(parentA, zoeEvent, "h5", inMinutes(31));
  await alertOn(parentB, zoeEvent, "h1", inMinutes(50));

  const forLea = await query.nextAlertAt(parentA, lea, AFTER);
  await step("the query succeeds", forLea.isSuccess);
  await step(
    "the child's earliest pending alert after the lead is read, skipping one already sent, one before the lead and a sibling's",
    forLea.getValue().unwrapOr(NOW).getTime() === inMinutes(60).getTime(),
    forLea.getValue().toUndefined(),
  );

  const forZoeByA = await query.nextAlertAt(parentA, zoe, AFTER);
  await step(
    "an alert forged onto another family's child reads nothing",
    forZoeByA.isSuccess && forZoeByA.getValue().isNone(),
    forZoeByA.getValue().toUndefined(),
  );

  const forZoe = await query.nextAlertAt(parentB, zoe, AFTER);
  await step(
    "the other family reads its own alert only",
    forZoe.getValue().unwrapOr(NOW).getTime() === inMinutes(50).getTime(),
    forZoe.getValue().toUndefined(),
  );

  const later = await query.nextAlertAt(parentA, tom, inMinutes(36));
  await step(
    "a child without pending alert after the lead reads nothing",
    later.getValue().isNone(),
  );

  await step(
    "every read runs inside a query span",
    spans.length === 4 && spans.every((name) => name.startsWith("select")),
    spans,
  );
}, "a child's next alert stays inside its family on a real database");
