/**
 * Proves the request-driven mode against a real Postgres with no loop, no LISTEN dispatcher
 * and no email poller started: a mutation's event and email ship right after its response
 * through the platform's waitUntil; a due reminder is pushed by the clock tick; two ticks
 * racing push it once; the live stream ends cleanly at its maximum lifetime, a reconnect
 * listens before it answers, and a change made while no stream was open is in the agenda
 * the client refetches on reconnect.
 */

import { exitUnlessLocalDatabase, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-request-driven", process.env.DATABASE_URL);

import { alert } from "@modules/alerts/schemas/alert.schema";
import { and, db, emailSchema, eq, inArray, outboxSchema } from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { makeSignature } from "better-auth/crypto";
import { z } from "zod";
import { auth } from "../src/auth";
import { di } from "../src/container";
import { createRequestDrivenApp } from "../src/request-driven";
import { env, FRONT_ORIGINS } from "../src/shared/env";
import { PgUserStreamPublisher } from "../src/shared/services/user-stream-relay";
import { requireFakeProviders, seedDemoFamily } from "./demo-family";
import { removeProbeUsers } from "./google-oauth-fixture";

requireFakeProviders("check-request-driven");

const probe = `check-request-driven-${crypto.randomUUID()}`;
const parentEmail = `${probe}@example.com`;
const origin = FRONT_ORIGINS[0] ?? "";
const fakes = di.FakeProviders.unwrap();
const decoder = new TextDecoder();

const Report = z.object({
  ok: z.boolean(),
  jobs: z.array(z.object({ job: z.string(), ok: z.boolean() })),
});
const EventPage = z.object({ items: z.array(z.object({ id: z.string() })) });

const deferred: Promise<unknown>[] = [];
const handler = await createRequestDrivenApp({
  waitUntil: (work) => deferred.push(work),
  clientAddress: () => "198.51.100.20",
});

async function settle(): Promise<void> {
  while (deferred.length > 0) await Promise.all(deferred.splice(0));
}

async function sessionCookie(userId: string): Promise<string> {
  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(userId);
  const signature = await makeSignature(session.token, context.secret);
  return `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${signature}`)}`;
}

function client(cookie: string) {
  return (path: string, method = "GET", body?: unknown, signal?: AbortSignal) =>
    handler.fetch(
      new Request(`http://api.local${path}`, {
        method,
        signal,
        headers: { cookie, origin, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
}

function tick() {
  return handler.fetch(
    new Request("http://api.local/internal/tick", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CRON_SECRET ?? ""}` },
    }),
  );
}

async function readUntilEnd(body: ReadableStream<Uint8Array>): Promise<string> {
  let text = "";
  for await (const chunk of body) text += decoder.decode(chunk);
  return text;
}

async function firstFrame(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const chunk = await reader.read();
  reader.releaseLock();
  return decoder.decode(chunk.value);
}

const { step, run } = stepRunner("check-request-driven", async () => {
  await settle();
  await di.NotificationStreamHub.stop();
  await removeProbeUsers(probe);
  await db
    .delete(emailSchema.emailMessage)
    .where(eq(emailSchema.emailMessage.toAddress, parentEmail));
});

run(async () => {
  await step(
    "the clock routes are enabled by a secret and the stream has a maximum lifetime",
    env.CRON_SECRET !== undefined && env.STREAM_MAX_LIFETIME_MS !== undefined,
  );

  const family = await seedDemoFamily(parentEmail, probe);
  const call = client(await sessionCookie(family.userId));

  const deletion = await call("/me/delete", "POST");
  await settle();
  const [requested] = await db
    .select({ dispatchedAt: outboxSchema.outboxEvent.dispatchedAt })
    .from(outboxSchema.outboxEvent)
    .where(
      and(
        eq(outboxSchema.outboxEvent.aggregateId, family.userId),
        eq(outboxSchema.outboxEvent.eventType, EventTypes.USER_DELETION_REQUESTED),
      ),
    );
  const emails = await db
    .select({ status: emailSchema.emailMessage.status })
    .from(emailSchema.emailMessage)
    .where(eq(emailSchema.emailMessage.toAddress, parentEmail));
  await step(
    "a mutation's event and email are delivered right after its response, with no loop and no tick",
    deletion.status === 200 &&
      requested?.dispatchedAt != null &&
      emails.length > 0 &&
      emails.every(({ status }) => status === "sent"),
    { status: deletion.status, requested, emails },
  );
  await call("/me/delete", "DELETE");
  await settle();

  const reminders = await db
    .select({ id: alert.id })
    .from(alert)
    .where(and(eq(alert.userId, family.userId), eq(alert.status, "pending")))
    .limit(2);
  if (reminders.length < 2) throw new Error("the demo family has fewer than two pending alerts");
  const reminderIds = reminders.map(({ id }) => id);
  await db
    .update(alert)
    .set({ dueAt: new Date(Date.now() - 60_000) })
    .where(inArray(alert.id, reminderIds));
  const reminderTick = await tick();
  const announced = await db
    .select({ dispatchedAt: outboxSchema.outboxEvent.dispatchedAt })
    .from(outboxSchema.outboxEvent)
    .where(
      and(
        inArray(outboxSchema.outboxEvent.aggregateId, reminderIds),
        eq(outboxSchema.outboxEvent.eventType, EventTypes.ALERT_SENT),
      ),
    );
  const reminderEmails = await db
    .select({ status: emailSchema.emailMessage.status })
    .from(emailSchema.emailMessage)
    .where(
      and(
        eq(emailSchema.emailMessage.toAddress, parentEmail),
        eq(emailSchema.emailMessage.template, "alert_group"),
      ),
    );
  await step(
    "reminders due at tick time are sent, announced and their queued email delivered by that same tick",
    reminderTick.status === 200 &&
      announced.length === 2 &&
      announced.every(({ dispatchedAt }) => dispatchedAt !== null) &&
      reminderEmails.length === 1 &&
      reminderEmails[0]?.status === "sent",
    { status: reminderTick.status, announced, reminderEmails },
  );

  const endpointUrl = `https://fcm.googleapis.com/fcm/send/${probe}`;
  const subscribed = await call("/push/subscriptions", "POST", {
    endpoint: endpointUrl,
    keys: { p256dh: "demo-p256dh", auth: "demo-auth" },
  });
  const due = await db
    .select({ id: alert.id })
    .from(alert)
    .where(and(eq(alert.userId, family.userId), eq(alert.status, "pending")))
    .limit(2);
  if (due.length < 2) throw new Error("the demo family has fewer than two pending alerts");
  const dueIds = due.map(({ id }) => id);
  await db
    .update(alert)
    .set({ dueAt: new Date(Date.now() - 60_000) })
    .where(inArray(alert.id, dueIds));

  const [first, second] = await Promise.all([tick(), tick()]);
  const reports = await Promise.all([first, second].map(async (res) => res?.json()));
  const pushes = fakes.pushed().filter(({ endpoint }) => endpoint === endpointUrl).length;
  const sent = await db
    .select({ status: alert.status })
    .from(alert)
    .where(inArray(alert.id, dueIds));
  await step(
    "due reminders are pushed by the clock tick, and two racing ticks push them once",
    subscribed.status === 204 &&
      first?.status === 200 &&
      second?.status === 200 &&
      reports.every((report) => Report.safeParse(report).data?.ok === true) &&
      pushes === 1 &&
      sent.every(({ status }) => status === "sent"),
    { pushes, sent, reports },
  );

  const lifetimeMs = env.STREAM_MAX_LIFETIME_MS ?? 0;
  const openedAt = Date.now();
  const firstStream = await call("/stream");
  if (!firstStream.body) throw new Error("stream without body");
  const ended = await readUntilEnd(firstStream.body);
  const lastedMs = Date.now() - openedAt;
  await step(
    "the live stream ends cleanly once its maximum lifetime is reached",
    firstStream.status === 200 && lastedMs >= lifetimeMs && lastedMs < lifetimeMs + 2_000,
    { lastedMs, lifetimeMs, ended },
  );

  const agenda = EventPage.parse(await (await call("/events?limit=50")).json()).items;
  const removed = agenda[0];
  if (!removed) throw new Error("the demo agenda is empty");
  const removedStatus = (await call(`/events/${removed.id}`, "DELETE")).status;
  await settle();

  const reconnect = new AbortController();
  const secondStream = await call("/stream", "GET", undefined, reconnect.signal);
  if (!secondStream.body) throw new Error("stream without body");
  await new PgUserStreamPublisher(di.IInstrumentation).publish(family.userId, {
    type: "sync.finished",
    childId: family.childIds[0] ?? "",
  });
  const frame = await firstFrame(secondStream.body);
  reconnect.abort();
  const refetched = EventPage.parse(await (await call("/events?limit=50")).json()).items;
  await step(
    "a reconnect listens before it answers, and a change made between two streams is in the refetched agenda",
    secondStream.status === 200 &&
      frame.includes('"type":"sync.finished"') &&
      removedStatus === 204 &&
      !refetched.some(({ id }) => id === removed.id),
    { frame, removedStatus },
  );
}, "the request-driven mode delivers, ticks and streams without a process loop");
