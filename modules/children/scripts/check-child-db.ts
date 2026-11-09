/**
 * Proves against a real Postgres what mocked ports cannot: a family never reads or writes
 * another family's child (ownership in every WHERE), deleting a user cascades its children,
 * disconnecting removes the linked BetterAuth account row and two simultaneous disconnects
 * revoke once, a refreshed token is stored sealed, two concurrent claims return disjoint
 * children, one sync at a time per child (a manual sync during a lease answers running, a
 * late worker's end of sync is fenced out), and every google-classroom link, attached to a
 * child or not, ends revoked and erased. Google is stubbed.
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
    .where(
      and(
        eq(authSchema.account.userId, userId),
        eq(authSchema.account.providerId, "google-classroom"),
      ),
    );
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

async function linkAccount(
  userId: string,
  name: string,
  expired = false,
  scopes = CLASSROOM_SCOPES,
): Promise<string> {
  const id = `${userId}-${name}`;
  await db.insert(authSchema.account).values({
    id,
    accountId: `sub-${id}`,
    providerId: "google-classroom",
    userId,
    accessToken: `${SEAL}ya29.${name}`,
    refreshToken: `${SEAL}1//${name}`,
    accessTokenExpiresAt: new Date(T0.getTime() + (expired ? -60_000 : 3600_000)),
    scope: ["openid", "email", "profile", ...scopes].join(","),
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

  const workerClaim = await service.claimDueForSync(1000, T0);
  const duringLease = await service.claimManualSync(a, aChild, new Date(T0.getTime() + 5_000));
  await step(
    "a manual sync during the worker's lease answers running, never a second sync",
    workerClaim.isSuccess &&
      workerClaim.getValue().some((d) => d.childId === aChild) &&
      duringLease.isSuccess &&
      duringLease.getValue().outcome === "running",
  );

  const workerLease = workerClaim.isSuccess
    ? workerClaim.getValue().find((d) => d.childId === aChild)
    : undefined;
  const afterCrash = new Date(T0.getTime() + LEASE_MS);
  const takeover = await service.claimManualSync(a, aChild, afterCrash);
  const takeoverClaim = takeover.isSuccess ? takeover.getValue() : undefined;
  await step(
    "once the worker's lease has expired, a manual sync takes over with a new lease",
    takeoverClaim?.outcome === "started" &&
      workerLease !== undefined &&
      takeoverClaim.lease.lease > workerLease.lease,
  );
  if (workerLease === undefined || takeoverClaim?.outcome !== "started")
    throw new Error("no lease to fence");

  const late = await service.markSynced(workerLease, afterCrash, new Date(T0.getTime() + 3600_000));
  const afterLate = await childRow(aChild);
  await step(
    "the late worker's end of sync is refused and leaves the new sync untouched",
    codeOf(late) === "CHILD_SYNC_LEASE_CONFLICT" &&
      afterLate?.syncStartedAt?.getTime() === afterCrash.getTime() &&
      afterLate.lastSyncedAt === null,
  );
  const failedAt = new Date(T0.getTime() + 12 * 60_000);
  const failed = await service.markSyncFailed(takeoverClaim.lease, failedAt);
  const afterFailure = await childRow(aChild);
  await step(
    "the current lease holder's markSyncFailed sets the next sync and clears syncing",
    failed.isSuccess &&
      afterFailure?.nextSyncAt.getTime() === failedAt.getTime() &&
      afterFailure.syncStartedAt === null,
  );

  const racedAt = new Date(afterCrash.getTime() + 61_000);
  const manual = await Promise.all([
    service.claimManualSync(a, aChild, racedAt),
    service.claimManualSync(a, aChild, racedAt),
  ]);
  const outcomes = manual.map((r) => (r.isSuccess ? r.getValue().outcome : codeOf(r)));
  await step(
    "two concurrent manual syncs start once, the other is told it is running",
    [...outcomes].sort().join() === "running,started",
    { outcomes },
  );
  const started = manual
    .map((r) => (r.isSuccess ? r.getValue() : undefined))
    .find((c) => c?.outcome === "started");
  if (started?.outcome !== "started") throw new Error("no started manual sync");
  await service.markSynced(started.lease, racedAt, new Date(T0.getTime() + 20 * 60_000));
  const soon = await service.claimManualSync(a, aChild, new Date(racedAt.getTime() + 30_000));
  await step(
    "a manual sync requested 30 s after the last one is throttled",
    soon.isSuccess && soon.getValue().outcome === "throttled",
  );

  const extra = [];
  for (const name of ["a-max", "a-zoe", "a-eli"]) {
    extra.push(await register(a, await linkAccount(a, name), name));
  }
  const probeIds = new Set([aChild, bChild, ...extra]);
  const claimAt = new Date(T0.getTime() + 30 * 60_000);
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
    "a manual sync on a child blocked by its school is refused with CHILD_SYNC_BLOCKED",
    codeOf(await service.claimManualSync(b, bChild, claimAt)) === "CHILD_SYNC_BLOCKED",
  );
  await step(
    "a blocked child is never claimed",
    mine(await service.claimDueForSync(1000, new Date(claimAt.getTime() + 3 * LEASE_MS))).every(
      (id) => id !== bChild,
    ) && (await childRow(bChild))?.cause === "school_blocked",
  );

  const twin = await register(a, await linkAccount(a, "a-twin"), "Jumeau");
  const revokedBefore = revoked.length;
  const twice = await Promise.all([service.disconnect(a, twin), service.disconnect(a, twin)]);
  const twinEvents = await db
    .select()
    .from(outboxSchema.outboxEvent)
    .where(
      and(
        eq(outboxSchema.outboxEvent.aggregateId, twin),
        eq(outboxSchema.outboxEvent.eventType, "child.account.disconnected"),
      ),
    );
  await step(
    "two simultaneous disconnects revoke once and announce once",
    twice
      .map((r) => codeOf(r))
      .sort()
      .join() === "CHILD_NOT_FOUND,ok" &&
      revoked.length - revokedBefore === 1 &&
      twinEvents.length === 1,
    { outcomes: twice.map((r) => codeOf(r)), revocations: revoked.length - revokedBefore },
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

  const noScope = await linkAccount(a, "a-noscope", false, []);
  const refusedLink = await service.register(a, { linkedAccountId: noScope });
  await step(
    "a link without the Classroom scopes is revoked, erased and refused with CHILD_SCOPES_MISSING",
    codeOf(refusedLink) === "CHILD_SCOPES_MISSING" &&
      revoked.includes("1//a-noscope") &&
      (await accountRow(noScope)) === undefined,
  );

  const parentSignIn = `${a}-google`;
  await db.insert(authSchema.account).values({
    id: parentSignIn,
    accountId: `sub-${parentSignIn}`,
    providerId: "google",
    userId: a,
    updatedAt: T0,
  });
  await step(
    "the parent's own google account can never be discarded as a child link",
    codeOf(await service.discardLinked(a, parentSignIn)) === "CHILD_ACCOUNT_NOT_LINKED" &&
      (await accountRow(parentSignIn)) !== undefined,
  );

  const orphan = await linkAccount(a, "a-orphan");
  const wiped = await service.revokeAllFor(a);
  const left = await db
    .select({ id: authSchema.account.id, providerId: authSchema.account.providerId })
    .from(authSchema.account)
    .where(eq(authSchema.account.userId, a));
  await step(
    "revokeAllFor revokes and erases every google-classroom account, attached to a child or not",
    wiped.isSuccess &&
      wiped.getValue().revoked === extra.length + 1 &&
      wiped.getValue().failed === 0 &&
      revoked.includes("1//a-orphan") &&
      left.map((row) => row.providerId).join() === "google" &&
      (await service.list(a)).getValue().length === 0 &&
      (await accountRow(orphan)) === undefined,
    { left: left.length },
  );

  await db.delete(authSchema.user).where(eq(authSchema.user.id, b));
  await step("deleting a user cascades its children", (await childRow(bChild)) === undefined);
}, "children stay inside their family, erasure and claims hold on a real database");
