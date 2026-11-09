/**
 * Proves against a real Postgres what mocked ports cannot: a family never reads or writes
 * another family's child (ownership in every WHERE), deleting a user cascades its children,
 * disconnecting removes the linked BetterAuth account row, a refreshed token is stored sealed,
 * two concurrent claims return disjoint children and a claimed child stays unclaimable until
 * its lease ends, and two concurrent manual syncs start once. Google is stubbed.
 */

import { exitUnlessLocalDatabase, spanRecorder, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-child-db", process.env.DATABASE_URL);

import { Option, Result } from "@packages/ddd-kit";
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
import { childAccount } from "../schemas/child.schema";
import type { ChildrenError } from "../src/application/ports/child-repository.port";
import type { TokenSealing } from "../src/application/ports/google-credential-store.port";
import type {
  IGoogleLinkedAccounts,
  LinkedGoogleAccount,
} from "../src/application/ports/google-linked-accounts.port";
import type {
  GoogleAccess,
  IGoogleOAuthClient,
} from "../src/application/ports/google-oauth-client.port";
import { ChildConnectionService } from "../src/application/services/child-connection.service";
import { DrizzleGoogleCredentialStore } from "../src/infrastructure/adapters/drizzle-google-credential.store";
import { DrizzleLinkedAccountEraser } from "../src/infrastructure/adapters/drizzle-linked-account.eraser";
import { DrizzleChildRepository } from "../src/infrastructure/repositories/drizzle-child.repository";

const CLASSROOM_SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.announcements.readonly",
];
const SEAL = "sealed:";
const LEASE_MS = 10 * 60_000;
const T0 = new Date("2030-01-01T08:00:00.000Z");
const probe = `check-child-db-${crypto.randomUUID()}`;
const { instrumentation } = spanRecorder();

const sealing: TokenSealing = {
  seal: async (plain) => `${SEAL}${plain}`,
  open: async (sealed) =>
    sealed.startsWith(SEAL) ? Result.ok(sealed.slice(SEAL.length)) : Result.fail("unsealable"),
};

const linkedAccounts: IGoogleLinkedAccounts = {
  async find(userId, linkedAccountId) {
    const rows = await accountsOf(userId);
    return Result.ok(Option.fromNullable(rows.find((a) => a.linkedAccountId === linkedAccountId)));
  },
  async listForUser(userId) {
    return Result.ok(await accountsOf(userId));
  },
};

async function accountsOf(userId: string): Promise<LinkedGoogleAccount[]> {
  const rows = await db
    .select()
    .from(authSchema.account)
    .where(eq(authSchema.account.userId, userId));
  return rows.map((row) => ({
    linkedAccountId: row.id,
    grantedScopes: (row.scope ?? "").split(/[\s,]+/),
    hasRefreshToken: row.refreshToken !== null,
  }));
}

const revoked: string[] = [];
const google: IGoogleOAuthClient = {
  refresh: async () =>
    Result.ok<GoogleAccess, ChildrenError>({
      accessToken: "ya29.refreshed",
      expiresAt: new Date(T0.getTime() + 3600_000),
      refreshToken: Option.none(),
    }),
  revoke: async (token) => {
    revoked.push(token);
    return Result.ok();
  },
  profile: async (token) =>
    Result.ok({ email: `${token.replace(/\W/g, "")}@school.example`, givenName: Option.none() }),
};

const outbox = new DrizzleOutboxRepository(instrumentation, () => undefined);
const service = new ChildConnectionService(
  new DrizzleChildRepository(instrumentation),
  linkedAccounts,
  new DrizzleGoogleCredentialStore(sealing, instrumentation),
  google,
  new DrizzleLinkedAccountEraser(instrumentation),
  new TransactionService(instrumentation, async (events) => {
    await outbox.enqueue(events, { source: "check-child-db" });
  }),
  outbox,
  instrumentation,
  { classroomScopes: CLASSROOM_SCOPES },
  () => T0,
);

async function createUser(name: string): Promise<string> {
  const id = `${probe}-${name}`;
  await db.insert(authSchema.user).values({ id, name, email: `${id}@example.com` });
  return id;
}

async function linkAccount(userId: string, name: string, expired = false): Promise<string> {
  const id = `${userId}-${name}`;
  await db.insert(authSchema.account).values({
    id,
    accountId: `sub-${id}`,
    providerId: "google-classroom",
    userId,
    accessToken: `${SEAL}ya29.${name}`,
    refreshToken: `${SEAL}1//${name}`,
    accessTokenExpiresAt: new Date(T0.getTime() + (expired ? -60_000 : 3600_000)),
    scope: ["openid", "email", "profile", ...CLASSROOM_SCOPES].join(","),
    updatedAt: T0,
  });
  return id;
}

async function register(userId: string, linkedAccountId: string, label: string): Promise<string> {
  const result = await service.register(userId, { linkedAccountId, label });
  if (result.isFailure) throw new Error(`register failed: ${JSON.stringify(result.getError())}`);
  return result.getValue().id;
}

async function childRow(childId: string) {
  const [row] = await db.select().from(childAccount).where(eq(childAccount.id, childId));
  return row;
}

async function accountRow(id: string) {
  const [row] = await db.select().from(authSchema.account).where(eq(authSchema.account.id, id));
  return row;
}

const codeOf = (result: Result<unknown, ChildrenError>) =>
  result.isFailure ? result.getError().code : "ok";

async function cleanup(): Promise<void> {
  const children = await db
    .select({ id: childAccount.id })
    .from(childAccount)
    .where(like(childAccount.userId, `${probe}%`));
  const users = await db
    .select({ id: authSchema.user.id })
    .from(authSchema.user)
    .where(like(authSchema.user.id, `${probe}%`));
  const aggregateIds = [...children.map(({ id }) => id), ...users.map(({ id }) => id)];
  if (aggregateIds.length > 0)
    await db
      .delete(outboxSchema.outboxEvent)
      .where(inArray(outboxSchema.outboxEvent.aggregateId, aggregateIds));
  await db.delete(authSchema.user).where(like(authSchema.user.id, `${probe}%`));
}

const { step, run } = stepRunner("check-child-db", cleanup);

run(async () => {
  const a = await createUser("a");
  const b = await createUser("b");
  const aAccount = await linkAccount(a, "a-lea");
  const bAccount = await linkAccount(b, "b-tom", true);
  const aChild = await register(a, aAccount, "Léa");
  const bChild = await register(b, bAccount, "Tom");

  await step(
    "A cannot register B's linked account",
    codeOf(await service.register(a, { linkedAccountId: bAccount })) === "CHILD_ACCOUNT_NOT_LINKED",
  );
  await step(
    "registering the same account twice is refused",
    codeOf(await service.register(a, { linkedAccountId: aAccount })) === "CHILD_ALREADY_CONNECTED",
  );
  const aList = await service.list(a);
  await step(
    "A lists only its own child",
    aList.isSuccess &&
      aList
        .getValue()
        .map((c) => c.id)
        .join() === aChild,
  );
  await step(
    "A cannot rename B's child",
    codeOf(await service.rename(a, bChild, "Pirate")) === "CHILD_NOT_FOUND" &&
      (await childRow(bChild))?.label === "Tom",
  );
  await step(
    "A cannot reconnect B's child",
    codeOf(await service.reconnect(a, bChild)) === "CHILD_NOT_FOUND",
  );
  await step(
    "A cannot start a sync of B's child",
    codeOf(await service.claimManualSync(a, bChild, T0)) === "CHILD_NOT_FOUND",
  );
  await step(
    "A cannot disconnect B's child, whose account row stays",
    codeOf(await service.disconnect(a, bChild)) === "CHILD_NOT_FOUND" &&
      (await childRow(bChild)) !== undefined &&
      (await accountRow(bAccount)) !== undefined &&
      revoked.length === 0,
  );

  const token = await service.accessTokenFor(bChild);
  const bStored = await accountRow(bAccount);
  await step(
    "an expired token is refreshed, served in clear and stored sealed",
    token.isSuccess &&
      token.getValue() === "ya29.refreshed" &&
      bStored?.accessToken === `${SEAL}ya29.refreshed` &&
      bStored.refreshToken === `${SEAL}1//b-tom`,
  );

  const manual = await Promise.all([
    service.claimManualSync(a, aChild, T0),
    service.claimManualSync(a, aChild, T0),
  ]);
  await step(
    "two concurrent manual syncs start once",
    manual
      .map((r) => (r.isSuccess ? r.getValue() : "error"))
      .sort()
      .join() === "started,throttled",
  );
  await step(
    "a manual sync 61 s later starts again",
    (await service.claimManualSync(a, aChild, new Date(T0.getTime() + 61_000))).getValue() ===
      "started",
  );
  const failedAt = new Date(T0.getTime() + 5 * 60_000);
  await service.markSyncFailed(aChild, failedAt);
  const afterFailure = await childRow(aChild);
  await step(
    "markSyncFailed sets the given next sync and clears syncing",
    afterFailure?.nextSyncAt.getTime() === failedAt.getTime() &&
      afterFailure.syncStartedAt === null,
  );

  const extra = [];
  for (const name of ["a-max", "a-zoe", "a-eli"]) {
    extra.push(await register(a, await linkAccount(a, name), name));
  }
  const probeIds = new Set([aChild, bChild, ...extra]);
  const claimAt = new Date(T0.getTime() + 6 * 60_000);
  const mine = (result: Result<{ childId: string }[], ChildrenError>) =>
    result.isSuccess
      ? result
          .getValue()
          .map((d) => d.childId)
          .filter((id) => probeIds.has(id))
      : [];

  const [first, second] = await Promise.all([
    service.claimDueForSync(1000, claimAt),
    service.claimDueForSync(1000, claimAt),
  ]);
  const firstIds = mine(first);
  const secondIds = mine(second);
  await step(
    "two concurrent claims return disjoint sets covering every due child",
    firstIds.every((id) => !secondIds.includes(id)) &&
      new Set([...firstIds, ...secondIds]).size === probeIds.size,
    { first: firstIds.length, second: secondIds.length },
  );
  await step(
    "a claimed child is not claimable again before the lease ends",
    mine(await service.claimDueForSync(1000, new Date(claimAt.getTime() + LEASE_MS - 1000)))
      .length === 0,
  );
  await step(
    "a crashed sync is claimable again once the lease ends",
    mine(await service.claimDueForSync(1000, new Date(claimAt.getTime() + LEASE_MS))).length ===
      probeIds.size,
  );

  await service.markNeedsReconnect(bChild, "school_blocked");
  await step(
    "a blocked child is never claimed",
    mine(await service.claimDueForSync(1000, new Date(claimAt.getTime() + 3 * LEASE_MS))).every(
      (id) => id !== bChild,
    ) && (await childRow(bChild))?.cause === "school_blocked",
  );

  const disconnected = await service.disconnect(a, aChild);
  await step(
    "disconnect revokes, removes the account row and the child",
    disconnected.isSuccess &&
      revoked.includes("1//a-lea") &&
      (await accountRow(aAccount)) === undefined &&
      (await childRow(aChild)) === undefined,
  );
  const [disconnectedEvent] = await db
    .select()
    .from(outboxSchema.outboxEvent)
    .where(
      and(
        eq(outboxSchema.outboxEvent.aggregateId, aChild),
        eq(outboxSchema.outboxEvent.eventType, "child.account.disconnected"),
      ),
    );
  await step("CHILD_DISCONNECTED is committed with the erasure", disconnectedEvent !== undefined);

  await db.delete(authSchema.user).where(eq(authSchema.user.id, b));
  await step("deleting a user cascades its children", (await childRow(bChild)) === undefined);
}, "children stay inside their family, erasure and claims hold on a real database");
