/**
 * Proves against a real Postgres what mocked ports cannot: a family never reads or writes
 * another family's child (ownership in every WHERE), deleting a user cascades its children,
 * disconnecting removes the linked BetterAuth account row and two simultaneous disconnects
 * revoke once, a refreshed token is stored sealed, two concurrent claims return disjoint
 * children, one sync at a time per child (a manual sync during a lease answers running, a
 * late worker's end of sync is fenced out), a disconnect revokes outside any transaction and
 * a failed revoke leaves the child disconnecting until the resumption finishes it, and every
 * google-classroom link, attached to a child or not, ends revoked and erased, and parallel
 * writes of one child under its sync lease check ownership in share mode without deadlock.
 * Google is stubbed.
 */

import { exitUnlessLocalDatabase, spanRecorder, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-child-db", process.env.DATABASE_URL);

import { Option, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import {
  and,
  authSchema,
  db,
  eq,
  inArray,
  like,
  or,
  outboxSchema,
  resolveExecutor,
  sql,
  TransactionService,
} from "@packages/drizzle";
import { DrizzleOutboxRepository } from "@packages/outbox/drizzle-outbox.repository";
import { childAccount } from "../schemas/child.schema";
import { CHILD_PROVIDER_ID } from "../src/application/config/child-provider";
import { CLASSROOM_SCOPES } from "../src/application/config/classroom-scopes";
import type { ChildrenError } from "../src/application/ports/child-repository.port";
import type { TokenSealing } from "../src/application/ports/google-credential-store.port";
import type {
  GoogleAccess,
  IGoogleOAuthClient,
} from "../src/application/ports/google-oauth-client.port";
import { ChildConnectionService } from "../src/application/services/child-connection.service";
import { ChildSyncService } from "../src/application/services/child-sync.service";
import { GoogleAccessService } from "../src/application/services/google-access.service";
import { DrizzleGoogleCredentialStore } from "../src/infrastructure/adapters/drizzle-google-credential.store";
import { DrizzleGoogleLinkedAccounts } from "../src/infrastructure/adapters/drizzle-google-linked-accounts";
import { DrizzleLinkedAccountEraser } from "../src/infrastructure/adapters/drizzle-linked-account.eraser";
import { DrizzleChildRepository } from "../src/infrastructure/repositories/drizzle-child.repository";

const SEAL = "sealed:";
const LEASE_MS = 10 * 60_000;
const COOLDOWN_MS = 5 * 60_000;
const T0 = new Date("2030-01-01T08:00:00.000Z");
const probe = `check-child-db-${crypto.randomUUID()}`;
const { instrumentation } = spanRecorder();

const sealing: TokenSealing = {
  seal: async (plain) => `${SEAL}${plain}`,
  open: async (sealed) =>
    sealed.startsWith(SEAL) ? Result.ok(sealed.slice(SEAL.length)) : Result.fail("unsealable"),
};

const revoked: string[] = [];
let revokedInsideTransaction = 0;
let googleDown = false;
const google: IGoogleOAuthClient = {
  refresh: async () =>
    Result.ok<GoogleAccess, ChildrenError>({
      accessToken: "ya29.refreshed",
      expiresAt: new Date(T0.getTime() + 3600_000),
      refreshToken: Option.none(),
    }),
  revoke: async (token) => {
    if (UnitOfWorkContext.transaction() !== undefined) revokedInsideTransaction += 1;
    if (googleDown)
      return Result.fail<void, ChildrenError>({ code: "CHILD_PROVIDER_FAILURE", message: "down" });

    revoked.push(token);
    return Result.ok();
  },
  profile: async (token) =>
    Result.ok({ email: `${token.replace(/\W/g, "")}@school.example`, givenName: Option.none() }),
};

const outbox = new DrizzleOutboxRepository(instrumentation, () => undefined);
const transactions = new TransactionService(instrumentation, async (events) => {
  await outbox.enqueue(events, { source: "check-child-db" });
});
const childRepository = new DrizzleChildRepository(instrumentation);
const sync = new ChildSyncService(childRepository, transactions, outbox, instrumentation);
const access = new GoogleAccessService(
  childRepository,
  new DrizzleGoogleCredentialStore(sealing, instrumentation),
  google,
  sync,
  instrumentation,
  () => T0,
);
const service = new ChildConnectionService(
  childRepository,
  new DrizzleGoogleLinkedAccounts(instrumentation),
  access,
  new DrizzleLinkedAccountEraser(instrumentation),
  transactions,
  outbox,
  instrumentation,
  { classroomScopes: CLASSROOM_SCOPES, googleClientId: "check-client-id" },
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
  scopes: readonly string[] = CLASSROOM_SCOPES,
): Promise<string> {
  const id = `${userId}-${name}`;
  await db.insert(authSchema.account).values({
    id,
    accountId: `sub-${id}`,
    providerId: CHILD_PROVIDER_ID,
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

async function syncRequestsOf(childId: string): Promise<unknown[]> {
  const rows = await db
    .select({ payload: outboxSchema.outboxEvent.payload })
    .from(outboxSchema.outboxEvent)
    .where(
      and(
        eq(outboxSchema.outboxEvent.aggregateId, childId),
        eq(outboxSchema.outboxEvent.eventType, "child.account.sync_requested"),
      ),
    )
    .orderBy(outboxSchema.outboxEvent.id);

  return rows.map(({ payload }) => payload);
}

const codeOf = (result: Result<unknown, ChildrenError>) =>
  result.isFailure ? result.getError().code : "ok";

const probeOutboxRows = like(sql`${outboxSchema.outboxEvent.payload}->>'userId'`, `${probe}%`);

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
  await db
    .delete(outboxSchema.outboxEvent)
    .where(
      aggregateIds.length > 0
        ? or(inArray(outboxSchema.outboxEvent.aggregateId, aggregateIds), probeOutboxRows)
        : probeOutboxRows,
    );
  await db.delete(authSchema.user).where(like(authSchema.user.id, `${probe}%`));
}

async function ownershipUnderSharedLease(
  userId: string,
  childId: string,
  writers: number,
): Promise<{ owned: number; failed: string[] }> {
  let arrived = 0;
  let allArrived = () => {};
  const barrier = new Promise<void>((resolve) => {
    allArrived = resolve;
  });
  const outcomes = await Promise.allSettled(
    Array.from({ length: writers }, () =>
      transactions.run(async (): Promise<Result<boolean, ChildrenError>> => {
        await resolveExecutor()
          .select({ id: childAccount.id })
          .from(childAccount)
          .where(eq(childAccount.id, childId))
          .for("share");
        arrived += 1;
        if (arrived === writers) allArrived();
        await barrier;

        return sync.isOwnedBy(userId, childId);
      }),
    ),
  );

  return {
    owned: outcomes.filter(
      (outcome) =>
        outcome.status === "fulfilled" && outcome.value.isSuccess && outcome.value.getValue(),
    ).length,
    failed: outcomes.flatMap((outcome) => {
      if (outcome.status === "rejected") return [String(outcome.reason)];
      return outcome.value.isFailure ? [outcome.value.getError().code] : [];
    }),
  };
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
    codeOf(await sync.claimManualSync(a, bChild, T0)) === "CHILD_NOT_FOUND",
  );
  await step(
    "A cannot disconnect B's child, whose account row stays",
    codeOf(await service.disconnect(a, bChild)) === "CHILD_NOT_FOUND" &&
      (await childRow(bChild)) !== undefined &&
      (await accountRow(bAccount)) !== undefined &&
      revoked.length === 0,
  );

  const token = await access.accessTokenFor(bChild);
  const bStored = await accountRow(bAccount);
  await step(
    "an expired token is refreshed, served in clear and stored sealed",
    token.isSuccess &&
      token.getValue() === "ya29.refreshed" &&
      bStored?.accessToken === `${SEAL}ya29.refreshed` &&
      bStored.refreshToken === `${SEAL}1//b-tom`,
  );

  const workerClaim = await sync.claimDueForSync(1000, T0);
  const duringLease = await sync.claimManualSync(a, aChild, new Date(T0.getTime() + 5_000));
  await step(
    "a manual sync during the worker's lease answers running, never a second sync",
    workerClaim.isSuccess &&
      workerClaim.getValue().some((d) => d.childId === aChild) &&
      duringLease.isSuccess &&
      duringLease.getValue().outcome === "running",
  );

  const duringLeaseAt = new Date(T0.getTime() + 5_000);
  const reconnected = await service.reconnect(a, aChild);
  const reclaimed = await sync.claimDueForSync(1000, duringLeaseAt);
  const manualAfterReconnect = await sync.claimManualSync(a, aChild, duringLeaseAt);
  await step(
    "a reconnect during the worker's lease keeps it: no second claim, a manual sync answers running",
    reconnected.isSuccess &&
      reclaimed.isSuccess &&
      !reclaimed.getValue().some((d) => d.childId === aChild) &&
      manualAfterReconnect.isSuccess &&
      manualAfterReconnect.getValue().outcome === "running",
  );

  const workerLease = workerClaim.isSuccess
    ? workerClaim.getValue().find((d) => d.childId === aChild)
    : undefined;
  const afterCrash = new Date(T0.getTime() + LEASE_MS);
  const takeover = await sync.claimManualSync(a, aChild, afterCrash);
  const takeoverClaim = takeover.isSuccess ? takeover.getValue() : undefined;
  await step(
    "once the worker's lease has expired, a manual sync takes over with a new lease",
    takeoverClaim?.outcome === "started" &&
      workerLease !== undefined &&
      takeoverClaim.lease.lease > workerLease.lease,
  );
  if (workerLease === undefined || takeoverClaim?.outcome !== "started")
    throw new Error("no lease to fence");

  const staleHeld = await sync.holdsLease(workerLease);
  const currentHeld = await sync.holdsLease(takeoverClaim.lease);
  await step(
    "only the current lease holder holds the lease, the late worker does not",
    staleHeld.isSuccess &&
      staleHeld.getValue() === false &&
      currentHeld.isSuccess &&
      currentHeld.getValue() === true,
  );

  const concurrentWrites = await Promise.all(
    Array.from({ length: 6 }, () =>
      transactions.run(async () => {
        const held = await sync.holdsLease(takeoverClaim.lease);
        if (held.isFailure) return held;

        return sync.isOwnedBy(a, aChild);
      }),
    ),
  );
  await step(
    "concurrent sync writes of one child check their lease then ownership without deadlocking",
    concurrentWrites.every((owned) => owned.isSuccess && owned.getValue() === true),
    concurrentWrites.map((owned) => (owned.isSuccess ? owned.getValue() : owned.getError().code)),
  );

  const late = await sync.markSynced(workerLease, afterCrash, new Date(T0.getTime() + 3600_000));
  const afterLate = await childRow(aChild);
  await step(
    "the late worker's end of sync is refused and leaves the new sync untouched",
    codeOf(late) === "CHILD_SYNC_LEASE_CONFLICT" &&
      afterLate?.syncStartedAt?.getTime() === afterCrash.getTime() &&
      afterLate.lastSyncedAt === null,
  );
  const failedAt = new Date(T0.getTime() + 12 * 60_000);
  const failed = await sync.markSyncFailed(takeoverClaim.lease, failedAt);
  const afterFailure = await childRow(aChild);
  await step(
    "the current lease holder's markSyncFailed sets the next sync and clears syncing",
    failed.isSuccess &&
      afterFailure?.nextSyncAt.getTime() === failedAt.getTime() &&
      afterFailure.syncStartedAt === null,
  );

  const racedAt = new Date(afterCrash.getTime() + COOLDOWN_MS + 1_000);
  const requestedBefore = await syncRequestsOf(aChild);
  const manual = await Promise.all([
    sync.claimManualSync(a, aChild, racedAt),
    sync.claimManualSync(a, aChild, racedAt),
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
  const requestedAfter = await syncRequestsOf(aChild);
  await step(
    "the started manual sync is announced once, in its transaction, with the parent as actor",
    requestedAfter.length === requestedBefore.length + 1 &&
      JSON.stringify(requestedAfter.at(-1)) ===
        JSON.stringify({ userId: a, childId: aChild, actorUserId: a }),
    requestedAfter,
  );
  await sync.markSynced(started.lease, racedAt, new Date(T0.getTime() + 20 * 60_000));
  const soon = await sync.claimManualSync(a, aChild, new Date(racedAt.getTime() + 4 * 60_000));
  await step(
    "a manual sync requested 4 min after the last one is a no-op that tells when the next is possible",
    soon.isSuccess &&
      soon.getValue().outcome === "throttled" &&
      soon.getValue().retryAt.getTime() === racedAt.getTime() + COOLDOWN_MS,
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
    sync.claimDueForSync(1000, claimAt),
    sync.claimDueForSync(1000, claimAt),
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
    mine(await sync.claimDueForSync(1000, new Date(claimAt.getTime() + LEASE_MS - 1000))).length ===
      0,
  );
  await step(
    "a crashed sync is claimable again once the lease ends",
    mine(await sync.claimDueForSync(1000, new Date(claimAt.getTime() + LEASE_MS))).length ===
      probeIds.size,
  );

  await sync.markNeedsReconnect(bChild, "school_blocked");
  await step(
    "a manual sync on a child blocked by its school is refused with CHILD_SYNC_BLOCKED",
    codeOf(await sync.claimManualSync(b, bChild, claimAt)) === "CHILD_SYNC_BLOCKED",
  );
  await step(
    "a blocked child is never claimed",
    mine(await sync.claimDueForSync(1000, new Date(claimAt.getTime() + 3 * LEASE_MS))).every(
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
    ["CHILD_NOT_FOUND,ok", "ok,ok"].includes(
      twice
        .map((r) => codeOf(r))
        .sort()
        .join(),
    ) &&
      revoked.length - revokedBefore === 1 &&
      twinEvents.length === 1,
    { outcomes: twice.map((r) => codeOf(r)), revocations: revoked.length - revokedBefore },
  );

  const stuck = await register(a, await linkAccount(a, "a-stuck"), "Bloqué");
  googleDown = true;
  const failedDisconnect = await service.disconnect(a, stuck);
  googleDown = false;
  const stuckRow = await childRow(stuck);
  await step(
    "a disconnect whose revoke fails leaves the child disconnecting, its account kept",
    codeOf(failedDisconnect) === "CHILD_PROVIDER_FAILURE" &&
      stuckRow?.status === "disconnecting" &&
      (await accountRow(`${a}-a-stuck`)) !== undefined,
  );
  await step(
    "a disconnecting child is never claimed for a sync",
    !(await sync.claimDueForSync(1000, new Date(T0.getTime() + 1000 * LEASE_MS)))
      .getValue()
      .some((d) => d.childId === stuck),
  );
  const resumed = await service.resumeDisconnections(1000, new Date(T0.getTime() + 1000));
  await step(
    "the resumption revokes and finishes the stuck disconnect",
    resumed.isSuccess &&
      resumed.getValue().finished >= 1 &&
      revoked.includes("1//a-stuck") &&
      (await childRow(stuck)) === undefined &&
      (await accountRow(`${a}-a-stuck`)) === undefined,
    resumed.isSuccess ? resumed.getValue() : {},
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
    accessToken: `${SEAL}ya29.parent-own`,
    updatedAt: T0,
  });
  await step(
    "the parent's own google account is never discarded nor revoked as a child link",
    codeOf(await service.discardLinked(a, parentSignIn)) === "CHILD_ACCOUNT_NOT_LINKED" &&
      !revoked.includes("ya29.parent-own") &&
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

  await step(
    "no Google revoke ever ran inside an open transaction",
    revokedInsideTransaction === 0,
    {
      revokedInsideTransaction,
    },
  );

  const parallel = await ownershipUnderSharedLease(b, bChild, 4);
  await step(
    "4 parallel writes of one child, each holding its sync lease in share mode, all check ownership without deadlock",
    parallel.owned === 4 && parallel.failed.length === 0,
    parallel,
  );

  await db.delete(authSchema.user).where(eq(authSchema.user.id, b));
  await step("deleting a user cascades its children", (await childRow(bChild)) === undefined);

  await cleanup();
  const leftover = await db
    .select({ id: outboxSchema.outboxEvent.id })
    .from(outboxSchema.outboxEvent)
    .where(probeOutboxRows);
  await step("the cleanup leaves no outbox row of the probe users", leftover.length === 0, {
    leftover: leftover.length,
  });
}, "children stay inside their family, erasure and claims hold on a real database");
