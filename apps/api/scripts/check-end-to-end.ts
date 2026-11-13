/**
 * Proves the composed api end to end against a real Postgres, with FAKE_PROVIDERS standing
 * in for Google and the model. A parent links two children of the synthetic dataset; the
 * first sync fills the agenda from announcements and coursework, served over HTTP; a
 * second sync creates nothing; a deleted deadline stays deleted and an edited title stays
 * edited across a resync; a pg_notify reaches the live stream; a school block turns a
 * child to `blocked_by_school` and tells the parent's stream, a reconnect brings it back;
 * an unregistered linked account is discarded; a disconnection erases the child and its
 * events; the first sync plans a default alert for each live upcoming deadline but none
 * for one a coursework shadows or the parent deleted, and a due alert reaches the
 * parent's push subscription once, signing a phone out from another device removes only the
 * phone's push subscription, the reminders of a child being disconnected answer not
 * found; the account wipe revokes Google and leaves no row of
 * the family behind, alerts and push subscriptions included.
 */

import { exitUnlessLocalDatabase, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-end-to-end", process.env.DATABASE_URL);

import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import { alert, alertDelivery } from "@modules/alerts/schemas/alert.schema";
import { pushSubscription } from "@modules/alerts/schemas/push-subscription.schema";
import { CHILD_PROVIDER_ID } from "@modules/children/application/config/child-provider";
import { CLASSROOM_SCOPES } from "@modules/children/application/config/classroom-scopes";
import { childAccount } from "@modules/children/schemas/child.schema";
import { seenAnnouncement } from "@modules/classroom-sync/schemas/seen-announcement.schema";
import { Result } from "@packages/ddd-kit";
import {
  type AnyPgTable,
  alias,
  and,
  authSchema,
  count,
  db,
  emailSchema,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  like,
  or,
  outboxSchema,
  type SQL,
  sql,
} from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import type { UserStreamMessage } from "@packages/events/user-stream-message";
import { makeSignature } from "better-auth/crypto";
import { z } from "zod";
import { app } from "../src/app";
import { auth } from "../src/auth";
import { di } from "../src/container";
import { GOOGLE_IDENTITY_SCOPES } from "../src/shared/auth/google-scopes";
import { env, FRONT_ORIGINS } from "../src/shared/env";
import { PgUserStreamPublisher } from "../src/shared/services/user-stream-relay";
import { requireFakeProviders, seedDemoFamily } from "./demo-family";
import { removeProbeUsers } from "./google-oauth-fixture";

requireFakeProviders("check-end-to-end");

const probe = `check-end-to-end-${crypto.randomUUID()}`;
const parentEmail = `${probe}@example.com`;
const HOUR_MS = 3600_000;
const STREAM_WAIT_MS = 10_000;
const fakes = di.FakeProviders.unwrap();
const origin = FRONT_ORIGINS[0] ?? "";

const ChildRows = z.array(z.object({ id: z.string(), label: z.string(), status: z.string() }));

const EventRow = z.object({
  id: z.string(),
  childId: z.string(),
  title: z.string(),
  source: z.string(),
  done: z.boolean(),
});

const EventPage = z.object({ items: z.array(EventRow) });

const Checklist = z.object({ checklist: z.object({ done: z.array(z.string()) }) });

const Actor = z.object({ actorUserId: z.string() });

async function signedSession(
  userId: string,
): Promise<{ id: string; token: string; cookie: string }> {
  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(userId);
  const signature = await makeSignature(session.token, context.secret);
  const cookie = `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${signature}`)}`;

  return { id: session.id, token: session.token, cookie };
}

async function sessionCookie(userId: string): Promise<string> {
  return (await signedSession(userId)).cookie;
}

function client(cookie: string) {
  return (path: string, method = "GET", body?: unknown) =>
    app.request(path, {
      method,
      headers: { cookie, origin, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
}

type Call = ReturnType<typeof client>;

async function childrenOf(call: Call) {
  return ChildRows.parse(await (await call("/children")).json());
}

async function agendaOf(call: Call) {
  const pages = await Promise.all([
    call("/events?limit=50"),
    call("/events?scope=history&limit=50"),
  ]);
  const items = await Promise.all(
    pages.map(async (page) => EventPage.parse(await page.json()).items),
  );

  return items.flat();
}

async function rowsIn(table: AnyPgTable, where: SQL | undefined): Promise<number> {
  const [row] = await db.select({ total: count() }).from(table).where(where);
  return row?.total ?? 0;
}

function nextMessage(userId: string, type: UserStreamMessage["type"]) {
  return new Promise<UserStreamMessage | undefined>((resolve) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      resolve(undefined);
    }, STREAM_WAIT_MS);
    const unsubscribe = di.NotificationStreamHub.subscribe(userId, (message) => {
      if (message.type !== type) return;

      clearTimeout(timeout);
      unsubscribe();
      resolve(message);
    });
  });
}

const coursework = alias(agendaEvent, "coursework");

function shadowedAnnouncement(): SQL {
  return exists(
    db
      .select({ id: coursework.id })
      .from(coursework)
      .where(
        and(
          eq(agendaEvent.source, "announcement"),
          eq(coursework.source, "coursework"),
          isNull(coursework.deletedAt),
          isNull(coursework.withdrawnAt),
          eq(coursework.childId, agendaEvent.childId),
          eq(coursework.courseId, agendaEvent.courseId),
          eq(coursework.deadlineDate, agendaEvent.deadlineDate),
        ),
      ),
  );
}

async function pendingAlertsOn(userId: string, where: SQL | undefined): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(alert)
    .innerJoin(agendaEvent, eq(agendaEvent.id, alert.eventId))
    .where(and(eq(alert.userId, userId), eq(alert.status, "pending"), where));
  return row?.total ?? 0;
}

async function syncDue(at: Date): Promise<boolean> {
  await db
    .update(childAccount)
    .set({ nextSyncAt: at })
    .where(
      and(like(childAccount.linkedAccountId, `${probe}%`), eq(childAccount.status, "connected")),
    );
  const tick = await di.SyncDueChildrenService.runOnce(at);

  return tick.isSuccess && tick.getValue().children > 0;
}

const { step, run } = stepRunner("check-end-to-end", async () => {
  await di.OutboxDispatcher.stop();
  await di.NotificationStreamHub.stop();
  await removeProbeUsers(probe);
  await db
    .delete(emailSchema.emailMessage)
    .where(eq(emailSchema.emailMessage.toAddress, parentEmail));
});

run(async () => {
  const family = await seedDemoFamily(parentEmail, probe);
  const call = client(await sessionCookie(family.userId));
  const now = Date.now();

  const children = await childrenOf(call);
  await step(
    "the parent reads both children, named after their Google profile",
    JSON.stringify(children.map(({ label, status }) => [label, status])) ===
      JSON.stringify([
        ["Léa", "connected"],
        ["Hugo", "connected"],
      ]),
    children,
  );
  const [lea, hugo] = children;
  if (!lea || !hugo) throw new Error("demo children missing");

  const agenda = await agendaOf(call);
  await step(
    "the first sync fills the agenda of both children with upcoming deadlines and history",
    agenda.some((event) => event.childId === lea.id) &&
      agenda.some((event) => event.childId === hugo.id),
    agenda.length,
  );
  await step(
    "announcements and coursework both reach the agenda, turned-in coursework is done",
    agenda.some((event) => event.source === "announcement") &&
      agenda.some((event) => event.source === "coursework" && !event.done) &&
      agenda.some((event) => event.title === "DM n°2" && event.done),
    agenda.map(({ title, source, done }) => [title, source, done]),
  );

  const resynced = await syncDue(new Date(now + HOUR_MS));
  const afterResync = await agendaOf(call);
  await step(
    "a second sync of the same Classroom creates nothing",
    resynced && afterResync.length === agenda.length,
    { before: agenda.length, after: afterResync.length },
  );

  const fractions = agenda.find((event) => event.title === "Fiche d'exercices sur les fractions");
  const quiz = agenda.find((event) => event.title === "Quiz de vocabulaire, unité 4");
  if (!fractions || !quiz) throw new Error("dataset coursework missing from the agenda");
  const removed = await call(`/events/${fractions.id}`, "DELETE");
  const edited = await call(`/events/${quiz.id}`, "PATCH", { title: "Quiz unité 4, relu" });
  const editResync = await syncDue(new Date(now + 2 * HOUR_MS));
  const afterEdits = await agendaOf(call);
  await step(
    "a deleted deadline stays deleted and an edited title stays edited across a resync",
    removed.status === 204 &&
      edited.status === 200 &&
      editResync &&
      !afterEdits.some((event) => event.title === fractions.title) &&
      afterEdits.find((event) => event.id === quiz.id)?.title === "Quiz unité 4, relu",
    afterEdits.filter((event) => event.source === "coursework").map(({ title }) => title),
  );

  const ticked = await call(`/events/${quiz.id}/checklist`, "POST", {
    kind: "tick",
    itemId: "prepare.items.assessment.revise",
    done: true,
  });
  const otherDevice = client(await sessionCookie(family.userId));
  const seenElsewhere = Checklist.parse(
    await (await otherDevice(`/events/${quiz.id}`)).json(),
  ).checklist;
  const checklistEvents = await db
    .select({ payload: outboxSchema.outboxEvent.payload })
    .from(outboxSchema.outboxEvent)
    .where(
      and(
        eq(outboxSchema.outboxEvent.aggregateId, quiz.id),
        eq(outboxSchema.outboxEvent.eventType, EventTypes.EVENT_UPDATED),
        sql`${outboxSchema.outboxEvent.payload}->'fields' ? 'checklist'`,
      ),
    );
  await step(
    "a ticked preparation item is kept on the event, seen from another device, and announced with its actor",
    ticked.status === 200 &&
      seenElsewhere.done.includes("prepare.items.assessment.revise") &&
      checklistEvents.length === 1 &&
      Actor.safeParse(checklistEvents[0]?.payload).data?.actorUserId === family.userId,
    { status: ticked.status, seenElsewhere, checklistEvents },
  );

  const planned = {
    pending: await pendingAlertsOn(family.userId, sql`true`),
    upcomingLive: await rowsIn(
      agendaEvent,
      and(
        eq(agendaEvent.userId, family.userId),
        isNull(agendaEvent.deletedAt),
        isNull(agendaEvent.withdrawnAt),
        sql`${agendaEvent.deadlineAt} > now() + interval '3 days'`,
      ),
    ),
    shadowedAnnouncements: await rowsIn(
      agendaEvent,
      and(eq(agendaEvent.userId, family.userId), shadowedAnnouncement()),
    ),
    onShadowed: await pendingAlertsOn(family.userId, shadowedAnnouncement()),
    onRemoved: await pendingAlertsOn(
      family.userId,
      or(isNotNull(agendaEvent.deletedAt), isNotNull(agendaEvent.withdrawnAt)),
    ),
  };
  await step(
    "the sync plans default alerts, none on a deadline a coursework shadows or the parent deleted",
    planned.pending > 0 &&
      planned.shadowedAnnouncements > 0 &&
      planned.onShadowed === 0 &&
      planned.onRemoved === 0,
    planned,
  );

  const subscribed = await call("/push/subscriptions", "POST", {
    endpoint: `https://fcm.googleapis.com/fcm/send/${probe}`,
    keys: { p256dh: "demo-p256dh", auth: "demo-auth" },
  });
  const [due] = await db
    .select({ id: alert.id, eventId: alert.eventId })
    .from(alert)
    .where(and(eq(alert.userId, family.userId), eq(alert.status, "pending")))
    .limit(1);
  if (!due) throw new Error("no pending alert to dispatch");
  await db
    .update(alert)
    .set({ dueAt: new Date(Date.now() - 60_000) })
    .where(eq(alert.id, due.id));
  const firstRun = await di.AlertDispatchService.runOnce(new Date());
  const secondRun = await di.AlertDispatchService.runOnce(new Date());
  const topic = due.eventId.replaceAll("-", "");
  const [dispatched] = await db
    .select({ status: alert.status })
    .from(alert)
    .where(eq(alert.id, due.id));
  await step(
    "a due alert reaches the parent's push subscription once, without an email",
    subscribed.status === 204 &&
      fakes
        .pushed()
        .filter(
          ({ message, options }) =>
            options.topic === topic &&
            options.urgency === "high" &&
            message.tag === `event-${due.eventId}`,
        ).length === 1 &&
      dispatched?.status === "sent" &&
      firstRun.isSuccess &&
      firstRun.getValue().emailed === 0 &&
      secondRun.isSuccess &&
      secondRun.getValue().sent === 0,
    {
      subscribed: subscribed.status,
      dispatched,
      first: firstRun.isSuccess ? firstRun.getValue() : firstRun.getError(),
    },
  );

  const [leaAlerted] = await db
    .select({ eventId: alert.eventId })
    .from(alert)
    .innerJoin(agendaEvent, eq(agendaEvent.id, alert.eventId))
    .where(and(eq(agendaEvent.childId, lea.id), eq(alert.status, "pending")))
    .limit(1);
  if (!leaAlerted) throw new Error("no pending alert on a deadline of Léa");
  const remindersPath = `/events/${leaAlerted.eventId}/reminders`;
  const readable = (await call(remindersPath)).status;
  await db.update(childAccount).set({ status: "disconnecting" }).where(eq(childAccount.id, lea.id));
  const whileDisconnecting = {
    read: (await call(remindersPath)).status,
    customize: (
      await call(remindersPath, "PUT", {
        reminders: [{ kind: "days_before", days: 1, time: "18:00" }],
      })
    ).status,
    reset: (await call(remindersPath, "DELETE")).status,
  };
  await db.update(childAccount).set({ status: "connected" }).where(eq(childAccount.id, lea.id));
  await step(
    "the reminders of a child being disconnected answer not found to read, customize and reset",
    readable === 200 &&
      whileDisconnecting.read === 404 &&
      whileDisconnecting.customize === 404 &&
      whileDisconnecting.reset === 404,
    { readable, whileDisconnecting },
  );

  await di.NotificationStreamHub.start();
  const notified = nextMessage(family.userId, "sync.finished");
  await new PgUserStreamPublisher(di.IInstrumentation).publish(family.userId, {
    type: "sync.finished",
    childId: hugo.id,
  });
  const message = await notified;
  await step(
    "a pg_notify on the user stream reaches the parent's live stream",
    message?.type === "sync.finished" && message.childId === hugo.id,
    message,
  );

  await di.OutboxDispatcher.start(di);
  const childrenChanged = nextMessage(family.userId, "children.changed");
  fakes.blockSchool("hugo");
  const blockedSync = await syncDue(new Date(now + 3 * HOUR_MS));
  const afterBlock = await childrenOf(call);
  await step(
    "a school block turns the child to blocked_by_school, the other child stays connected",
    blockedSync &&
      afterBlock.find((child) => child.id === hugo.id)?.status === "blocked_by_school" &&
      afterBlock.find((child) => child.id === lea.id)?.status === "connected",
    afterBlock,
  );
  await step(
    "the block reaches the parent's live stream through the outbox",
    (await childrenChanged)?.type === "children.changed",
  );

  fakes.unblockSchool("hugo");
  const reconnected = await call(`/children/${hugo.id}/reconnect`, "POST");
  const afterReconnect = await childrenOf(call);
  await step(
    "once the school unblocks the app, a reconnect brings the child back",
    reconnected.status === 200 &&
      afterReconnect.find((child) => child.id === hugo.id)?.status === "connected",
    afterReconnect,
  );

  await db.insert(authSchema.account).values({
    id: `${probe}-spare`,
    accountId: `${probe}-spare`,
    providerId: CHILD_PROVIDER_ID,
    userId: family.userId,
    scope: [...GOOGLE_IDENTITY_SCOPES, ...CLASSROOM_SCOPES].join(" "),
  });
  const discarded = await call(`/children/linkable/${probe}-spare/discard`, "POST");
  await step(
    "a linked account the parent never registered is discarded",
    discarded.status === 204 &&
      (await rowsIn(authSchema.account, eq(authSchema.account.id, `${probe}-spare`))) === 0,
    discarded.status,
  );

  const phoneEndpoint = `https://fcm.googleapis.com/fcm/send/${probe}-phone`;
  const subscribePhone = (cookie: string) =>
    client(cookie)("/push/subscriptions", "POST", {
      endpoint: phoneEndpoint,
      keys: { p256dh: "demo-p256dh", auth: "demo-auth" },
    });
  const revokeFromLaptop = async (token: string) =>
    auth.handler(
      new Request(new URL("/api/auth/revoke-session", env.BETTER_AUTH_URL).href, {
        method: "POST",
        headers: {
          cookie: await sessionCookie(family.userId),
          origin,
          "content-type": "application/json",
        },
        body: JSON.stringify({ token }),
      }),
    );
  const phoneSessionOf = async () => {
    const [row] = await db
      .select({ sessionId: pushSubscription.sessionId })
      .from(pushSubscription)
      .where(eq(pushSubscription.endpoint, phoneEndpoint));
    return row?.sessionId;
  };

  const expired = await signedSession(family.userId);
  await subscribePhone(expired.cookie);
  await db.delete(authSchema.session).where(eq(authSchema.session.id, expired.id));
  const phone = await signedSession(family.userId);
  const phoneSubscribed = await subscribePhone(phone.cookie);
  await step(
    "a phone signing in again after its session expired ties its push subscription to the new session",
    phoneSubscribed.status === 204 && (await phoneSessionOf()) === phone.id,
    { status: phoneSubscribed.status, sessionId: await phoneSessionOf(), expected: phone.id },
  );

  const pushSubscriptions = di.PushSubscriptionService;
  const forgetSession = pushSubscriptions.forgetSession.bind(pushSubscriptions);
  pushSubscriptions.forgetSession = async () =>
    Result.fail({ code: "PUSH_PROVIDER_FAILURE", message: "push store down" });
  const refused = await revokeFromLaptop(phone.token);
  pushSubscriptions.forgetSession = forgetSession;
  const phoneSessionsLeft = await rowsIn(authSchema.session, eq(authSchema.session.id, phone.id));
  await step(
    "a revocation whose push removal fails keeps the phone's session and alerts, so the parent can retry",
    refused.status >= 500 && phoneSessionsLeft === 1 && (await phoneSessionOf()) === phone.id,
    { status: refused.status, phoneSessionsLeft },
  );

  const revoked = await revokeFromLaptop(phone.token);
  const endpointsLeft = (
    await db
      .select({ endpoint: pushSubscription.endpoint })
      .from(pushSubscription)
      .where(eq(pushSubscription.userId, family.userId))
  ).map(({ endpoint }) => endpoint);
  const announced = await rowsIn(
    outboxSchema.outboxEvent,
    and(
      eq(outboxSchema.outboxEvent.aggregateId, phone.id),
      eq(outboxSchema.outboxEvent.eventType, EventTypes.USER_SESSION_REVOKED),
    ),
  );
  await step(
    "signing the phone out from another device removes the phone's push alerts, keeps the other device's and announces it",
    phoneSubscribed.status === 204 &&
      revoked.status === 200 &&
      endpointsLeft.length === 1 &&
      endpointsLeft[0] === `https://fcm.googleapis.com/fcm/send/${probe}` &&
      announced === 1,
    { phone: phoneSubscribed.status, revoked: revoked.status, endpointsLeft, announced },
  );

  const leaEventsBefore = await rowsIn(agendaEvent, eq(agendaEvent.childId, lea.id));
  const disconnected = await call(`/children/${lea.id}`, "DELETE");
  await di.ChildConnectionService.resumeDisconnections(10, new Date(now + 4 * HOUR_MS));
  const afterDisconnect = await childrenOf(call);
  await step(
    "a disconnection erases the child and every event of its agenda",
    leaEventsBefore > 0 &&
      disconnected.status === 204 &&
      !afterDisconnect.some((child) => child.id === lea.id) &&
      (await rowsIn(agendaEvent, eq(agendaEvent.childId, lea.id))) === 0,
    { leaEventsBefore, status: disconnected.status, afterDisconnect },
  );

  await di.OutboxDispatcher.stop();
  await db
    .update(authSchema.user)
    .set({ pendingDeletionUntil: new Date(now - HOUR_MS) })
    .where(eq(authSchema.user.id, family.userId));
  const wiped = await di.RgpdService.executeAccountWipe({
    userId: family.userId,
    now: new Date(),
  });
  const childIds = [lea.id, hugo.id];
  const leftovers = {
    children: await rowsIn(childAccount, eq(childAccount.userId, family.userId)),
    events: await rowsIn(agendaEvent, eq(agendaEvent.userId, family.userId)),
    seen: await rowsIn(seenAnnouncement, inArray(seenAnnouncement.childId, childIds)),
    alerts: await rowsIn(alert, eq(alert.userId, family.userId)),
    deliveries: await rowsIn(alertDelivery, eq(alertDelivery.alertId, due.id)),
    pushSubscriptions: await rowsIn(pushSubscription, eq(pushSubscription.userId, family.userId)),
    accounts: await rowsIn(authSchema.account, eq(authSchema.account.userId, family.userId)),
    sessions: await rowsIn(authSchema.session, eq(authSchema.session.userId, family.userId)),
    users: await rowsIn(authSchema.user, eq(authSchema.user.id, family.userId)),
    outboxWithEmail: await rowsIn(
      outboxSchema.outboxEvent,
      sql`${outboxSchema.outboxEvent.payload}::text like ${`%${parentEmail}%`}`,
    ),
  };
  await step(
    "the account wipe leaves no row of the family behind and no outbox row naming its email",
    wiped.isSuccess && Object.values(leftovers).every((total) => total === 0),
    { wiped: wiped.isSuccess ? wiped.getValue() : wiped.getError(), leftovers },
  );
}, "the composed api serves a family its agenda from the fake Classroom");
