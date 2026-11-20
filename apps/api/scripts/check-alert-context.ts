/**
 * Proves against a real Postgres that the host query feeding alert messages reads only the
 * alert owner's rows: an alert forged onto another family's event or on a child being
 * disconnected comes back empty, the announcement description never leaves the database, and the
 * deadline carries the school's wall date with the parent's today read in the parent's zone.
 */

import { exitUnlessLocalDatabase, spanRecorder, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-alert-context", process.env.DATABASE_URL);

import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import { alert } from "@modules/alerts/schemas/alert.schema";
import { childAccount } from "@modules/children/schemas/child.schema";
import { seedParentWithChild } from "@modules/children/schemas/testing/seed-child";
import { PARIS_TIME_ZONE } from "@packages/ddd-kit/zoned-time";
import { authSchema, db, eq, like } from "@packages/drizzle";
import { AlertContextQuery } from "../src/queries/alert-context.query";

const NOW = new Date("2030-01-17T23:30:00.000Z");
const ORIGIN = "https://app.example";
const probe = `check-alert-context-${crypto.randomUUID()}`;
const { instrumentation, spans } = spanRecorder();
const MONTREAL = "America/Montreal";
const zoneOf = new Map<string, string>();
const timeZones = { of: async (userId: string) => zoneOf.get(userId) ?? PARIS_TIME_ZONE };
const query = new AlertContextQuery(instrumentation, ORIGIN, timeZones, () => NOW);

async function familyWithEvent(
  name: string,
  deadline: { date: string; time: string | null },
  childStatus: "connected" | "disconnecting" = "connected",
): Promise<{ userId: string; eventId: string }> {
  const userId = `${probe}-${name}`;
  const childId = await seedParentWithChild({ userId, name, at: NOW, label: `Enfant ${name}` });
  await db.update(childAccount).set({ status: childStatus }).where(eq(childAccount.id, childId));

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
      description: `secret description ${name}`,
      category: "assessment",
      deadlineDate: deadline.date,
      deadlineTime: deadline.time,
      deadlineAt: NOW,
      receivedAt: NOW,
      status: "confirmed",
    })
    .returning({ id: agendaEvent.id });
  if (!event) throw new Error(`event of ${name} not created`);

  return { userId, eventId: event.id };
}

async function alertOn(userId: string, eventId: string): Promise<string> {
  const [row] = await db
    .insert(alert)
    .values({
      userId,
      eventId,
      reminder: "d2@18:00",
      dueAt: NOW,
      deadlineAt: NOW,
      origin: "default",
      status: "pending",
    })
    .returning({ id: alert.id });
  if (!row) throw new Error("alert not created");
  return row.id;
}

async function cleanup(): Promise<void> {
  await db.delete(authSchema.user).where(like(authSchema.user.id, `${probe}-%`));
}

const { step, run } = stepRunner("check-alert-context", cleanup);

run(async () => {
  const a = await familyWithEvent("a", { date: "2030-01-18", time: "08:30:00" });
  const b = await familyWithEvent("b", { date: "2030-01-18", time: null });
  zoneOf.set(b.userId, MONTREAL);
  const c = await familyWithEvent("c", { date: "2030-01-21", time: null });
  const d = await familyWithEvent("d", { date: "2030-01-22", time: null }, "disconnecting");
  const alertOfA = await alertOn(a.userId, a.eventId);
  const alertOfB = await alertOn(b.userId, b.eventId);
  const forged = await alertOn(a.userId, c.eventId);
  const alertOfDisconnecting = await alertOn(d.userId, d.eventId);

  const loaded = await query.load([alertOfA, alertOfB, forged, alertOfDisconnecting]);
  await step("the query succeeds", loaded.isSuccess);
  const contexts = loaded.getValue();
  const byAlert = new Map(contexts.map((context) => [context.alertId, context]));

  await step(
    "an alert forged onto another family's event reads nothing",
    !byAlert.has(forged),
    contexts.map((context) => context.alertId),
  );
  await step(
    "an alert of a child being disconnected reads nothing, so it is never sent",
    contexts.length === 2 && !byAlert.has(alertOfDisconnecting),
    contexts.map((context) => context.alertId),
  );
  await step(
    "each context carries its owner's email, event and child",
    byAlert.get(alertOfA)?.email === `${a.userId}@example.com` &&
      byAlert.get(alertOfA)?.eventTitle === "Contrôle a" &&
      byAlert.get(alertOfA)?.childLabel === "Enfant a" &&
      byAlert.get(alertOfB)?.email === `${b.userId}@example.com`,
    contexts,
  );
  const deadlineOfA = byAlert.get(alertOfA)?.deadline;
  const deadlineOfB = byAlert.get(alertOfB)?.deadline;
  await step(
    "the deadline keeps the school's date and hour, and today is the parent's: Friday in Paris, still Thursday in Montreal",
    deadlineOfA?.date === "2030-01-18" &&
      deadlineOfA.time === "08:30" &&
      deadlineOfA.today === "2030-01-18" &&
      deadlineOfB?.date === "2030-01-18" &&
      deadlineOfB.time === undefined &&
      deadlineOfB.today === "2030-01-17",
    contexts.map((context) => context.deadline),
  );
  await step(
    "the link opens the event in the app",
    byAlert.get(alertOfA)?.eventUrl === `${ORIGIN}/events/${a.eventId}`,
  );
  const selected = spans.at(-1) ?? "";
  await step(
    "the announcement description is never selected",
    !selected.includes('"description"') && !JSON.stringify(contexts).includes("secret description"),
    selected,
  );

  const empty = await query.load([]);
  await step("no alert id reads nothing", empty.isSuccess && empty.getValue().length === 0);
}, "alert contexts stay inside the alert owner's family on a real database");
