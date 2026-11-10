/**
 * Serves the composed api for the browser journey (`apps/app/a11y/journey.spec.ts`), local
 * database only, FAKE_PROVIDERS required. Google's token endpoint is stubbed so the real
 * OAuth callbacks finish with a code `<sub>|<email>`: a dataset child's email is granted the
 * fake Classroom tokens and scopes, any other email signs in as a parent. The periodic
 * workers are stopped so time only moves when the journey says so, through a control
 * server on 127.0.0.1:JOURNEY_CONTROL_PORT:
 *
 * - POST /schools/<child>/block | /schools/<child>/unblock: the fake school's switch
 * - POST /sync?at=<iso>, /alerts?at=<iso>: one sync or alert dispatch tick at that instant
 * - POST /wipe?userId=<id>&at=<iso>: the account wipe of that parent at that instant
 * - GET /pushes: what the fake push sink received
 * - GET /leftovers?userId=<id>&email=<address>: the rows still naming that parent
 * - POST /reset: deletes the parents a journey signed in (`journey-*@example.com`) and,
 *   by cascade, everything they own, so an interrupted run never leaks into the next one
 */

import { exitUnlessLocalDatabase } from "@packages/test/db-check";

exitUnlessLocalDatabase("serve-journey", process.env.DATABASE_URL);

import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import { alert } from "@modules/alerts/schemas/alert.schema";
import { pushSubscription } from "@modules/alerts/schemas/push-subscription.schema";
import {
  alertDefaultReminders,
  alertEventReminders,
} from "@modules/alerts/schemas/reminder-settings.schema";
import { CLASSROOM_SCOPES } from "@modules/children/application/config/classroom-scopes";
import { childAccount } from "@modules/children/schemas/child.schema";
import { DATASET_CHILDREN, type DatasetChildKey } from "@modules/extraction/eval/classroom-dataset";
import {
  type AnyPgTable,
  authSchema,
  count,
  db,
  emailSchema,
  eq,
  like,
  outboxSchema,
  type SQL,
  sql,
} from "@packages/drizzle";
import { serve } from "bun";
import { di } from "../src/container";
import { demoAccessToken, demoRefreshToken } from "../src/dev/demo-dataset";
import { GOOGLE_IDENTITY_SCOPES } from "../src/shared/auth/google-scopes";
import { requireFakeProviders } from "./demo-family";
import { type GoogleIdentity, stubGoogleTokenEndpoint } from "./google-oauth-fixture";

requireFakeProviders("serve-journey");

const controlPort = Number(process.env.JOURNEY_CONTROL_PORT);
if (!Number.isInteger(controlPort) || controlPort <= 0) {
  console.error("serve-journey needs JOURNEY_CONTROL_PORT, the port of its control server");
  process.exit(1);
}

await import("../src/index");

const fakes = di.FakeProviders.unwrap();

globalThis.apiPeriodicWorkers?.abort();

const JOURNEY_PARENTS = "journey-%@example.com";

function childOf(email: string): DatasetChildKey | undefined {
  return DATASET_CHILDREN.find((child) => child.googleEmail === email)?.key;
}

stubGoogleTokenEndpoint((identity: GoogleIdentity) => {
  const key = childOf(identity.email);
  if (!key)
    return {
      accessToken: `ya29.journey-${identity.sub}`,
      refreshToken: `1//journey-${identity.sub}`,
      scope: GOOGLE_IDENTITY_SCOPES.join(" "),
    };

  return {
    accessToken: demoAccessToken(key),
    refreshToken: demoRefreshToken(key),
    scope: [...GOOGLE_IDENTITY_SCOPES, ...CLASSROOM_SCOPES].join(" "),
  };
});

async function rowsIn(table: AnyPgTable, where: SQL): Promise<number> {
  const [row] = await db.select({ total: count() }).from(table).where(where);
  return row?.total ?? 0;
}

async function leftovers(userId: string, email: string) {
  return {
    users: await rowsIn(authSchema.user, eq(authSchema.user.id, userId)),
    accounts: await rowsIn(authSchema.account, eq(authSchema.account.userId, userId)),
    sessions: await rowsIn(authSchema.session, eq(authSchema.session.userId, userId)),
    children: await rowsIn(childAccount, eq(childAccount.userId, userId)),
    events: await rowsIn(agendaEvent, eq(agendaEvent.userId, userId)),
    alerts: await rowsIn(alert, eq(alert.userId, userId)),
    defaultReminders: await rowsIn(alertDefaultReminders, eq(alertDefaultReminders.userId, userId)),
    eventReminders: await rowsIn(alertEventReminders, eq(alertEventReminders.userId, userId)),
    pushSubscriptions: await rowsIn(pushSubscription, eq(pushSubscription.userId, userId)),
    emails: await rowsIn(emailSchema.emailMessage, eq(emailSchema.emailMessage.toAddress, email)),
    outboxWithEmail: await rowsIn(
      outboxSchema.outboxEvent,
      sql`${outboxSchema.outboxEvent.payload}::text like ${`%${email}%`}`,
    ),
  };
}

function instantOf(url: URL): Date {
  return new Date(url.searchParams.get("at") ?? Number.NaN);
}

function answer(result: { isFailure: boolean; getError: () => unknown; getValue: () => unknown }) {
  if (result.isFailure) return Response.json({ error: result.getError() }, { status: 500 });

  return Response.json(result.getValue() ?? null);
}

async function control(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const [, action = "", key = "", toggle = ""] = url.pathname.split("/");
  const school = DATASET_CHILDREN.find((child) => child.key === key)?.key;

  if (request.method === "GET" && action === "pushes") return Response.json(fakes.pushed());
  if (request.method === "GET" && action === "leftovers")
    return Response.json(
      await leftovers(url.searchParams.get("userId") ?? "", url.searchParams.get("email") ?? ""),
    );
  if (request.method !== "POST") return new Response("not found", { status: 404 });

  if (action === "schools" && school && toggle === "block") {
    fakes.blockSchool(school);
    return new Response(null, { status: 204 });
  }
  if (action === "schools" && school && toggle === "unblock") {
    fakes.unblockSchool(school);
    return new Response(null, { status: 204 });
  }
  if (action === "reset") {
    const removed = await db
      .delete(authSchema.user)
      .where(like(authSchema.user.email, JOURNEY_PARENTS))
      .returning({ id: authSchema.user.id });
    return Response.json({ parents: removed.length });
  }
  if (action === "sync") return answer(await di.SyncDueChildrenService.runOnce(instantOf(url)));
  if (action === "alerts") return answer(await di.AlertDispatchService.runOnce(instantOf(url)));
  if (action === "wipe")
    return answer(
      await di.RgpdService.executeAccountWipe({
        userId: url.searchParams.get("userId") ?? "",
        now: instantOf(url),
      }),
    );

  return new Response("not found", { status: 404 });
}

serve({ port: controlPort, hostname: "127.0.0.1", fetch: control });
console.log(`journey control on 127.0.0.1:${controlPort}`);
