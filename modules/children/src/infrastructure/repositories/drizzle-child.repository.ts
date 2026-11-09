import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import {
  and,
  asc,
  dbOperationFailure,
  eq,
  inArray,
  lte,
  resolveExecutor,
  sql,
} from "@packages/drizzle";
import { childAccount } from "../../../schemas/child.schema";
import type {
  ChildrenError,
  DisconnectingChild,
  DueChild,
  IChildRepository,
  SyncLease,
} from "../../application/ports/child-repository.port";
import { ChildAccount } from "../../domain/child-account.aggregate";
import { ChildAccountId } from "../../domain/child-account-id";
import { ChildLabel } from "../../domain/value-objects/child-label.vo";
import { ChildStatus, type ChildStatusValue } from "../../domain/value-objects/child-status.vo";
import { GoogleEmail } from "../../domain/value-objects/google-email.vo";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("CHILD_PROVIDER_FAILURE");

const childNotFound: ChildrenError = {
  code: "CHILD_NOT_FOUND",
  message: "Cet enfant n'existe pas ou n'est plus relié à votre compte.",
};

const leaseLost: ChildrenError = {
  code: "CHILD_SYNC_LEASE_CONFLICT",
  message: "Cette synchronisation a été reprise par une autre tâche, son résultat est ignoré.",
};

type ChildRow = typeof childAccount.$inferSelect;

interface ClaimedRow extends DisconnectingChild {
  label: string;
}

function toDomain(row: ChildRow): Result<ChildAccount, string> {
  const id = ChildAccountId.parse(row.id);
  const googleEmail = GoogleEmail.create(row.googleEmail);
  const label = ChildLabel.create(row.label);
  const status = ChildStatus.create(row.status);
  if (id.isFailure) return Result.fail(id.getError());
  if (googleEmail.isFailure) return Result.fail(googleEmail.getError());
  if (label.isFailure) return Result.fail(label.getError());
  if (status.isFailure) return Result.fail(status.getError());

  return Result.ok(
    ChildAccount.reconstitute(
      {
        userId: row.userId,
        linkedAccountId: row.linkedAccountId,
        googleEmail: googleEmail.getValue(),
        label: label.getValue(),
        status: status.getValue(),
        connectedAt: row.connectedAt,
        lastSyncedAt: Option.fromNullable(row.lastSyncedAt),
        nextSyncAt: row.nextSyncAt,
        syncStartedAt: Option.fromNullable(row.syncStartedAt),
        lastSyncRequestedAt: Option.fromNullable(row.lastSyncRequestedAt),
        syncLease: row.syncLease,
      },
      id.getValue(),
    ),
  );
}

function leaseHeldBy(lease: SyncLease) {
  return and(eq(childAccount.id, lease.childId), eq(childAccount.syncLease, lease.lease));
}

function mutableColumns(child: ChildAccount) {
  const status = child.get("status");

  return {
    label: child.get("label").value,
    status: status.value,
    cause: status.cause().toNull(),
    nextSyncAt: child.get("nextSyncAt"),
    syncStartedAt: child.get("syncStartedAt").toNull(),
    lastSyncRequestedAt: child.get("lastSyncRequestedAt").toNull(),
    syncLease: child.get("syncLease"),
  };
}

export class DrizzleChildRepository implements IChildRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async create(child: ChildAccount): Promise<Result<void, ChildrenError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan({ name: "DrizzleChildRepository > create" }, async () => {
      try {
        const query = exec
          .insert(childAccount)
          .values({
            id: child.id.value,
            userId: child.get("userId"),
            linkedAccountId: child.get("linkedAccountId"),
            googleEmail: child.get("googleEmail").value,
            connectedAt: child.get("connectedAt"),
            ...mutableColumns(child),
          })
          .onConflictDoNothing({ target: childAccount.linkedAccountId })
          .returning({ id: childAccount.id });
        const inserted = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );
        if (inserted.length === 0)
          return Result.fail({
            code: "CHILD_ALREADY_CONNECTED",
            message: "Ce compte Google est déjà relié à l'un de vos enfants.",
          });

        return Result.ok();
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(repositoryFailure("create"));
      }
    });
  }

  async save(child: ChildAccount): Promise<Result<void, ChildrenError>> {
    return this.updateOne(
      "save",
      and(eq(childAccount.id, child.id.value), eq(childAccount.userId, child.get("userId"))),
      mutableColumns(child),
      childNotFound,
    );
  }

  async findOwned(
    userId: string,
    childId: string,
  ): Promise<Result<Option<ChildAccount>, ChildrenError>> {
    return this.findOne(
      "findOwned",
      and(eq(childAccount.id, childId), eq(childAccount.userId, userId)),
    );
  }

  async findForSystem(childId: string): Promise<Result<Option<ChildAccount>, ChildrenError>> {
    return this.findOne("findForSystem", eq(childAccount.id, childId));
  }

  async findByLinkedAccount(
    userId: string,
    linkedAccountId: string,
  ): Promise<Result<Option<ChildAccount>, ChildrenError>> {
    return this.findOne(
      "findByLinkedAccount",
      and(eq(childAccount.linkedAccountId, linkedAccountId), eq(childAccount.userId, userId)),
    );
  }

  async listForUser(userId: string): Promise<Result<ChildAccount[], ChildrenError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleChildRepository > listForUser" },
      async () => {
        try {
          const query = exec
            .select()
            .from(childAccount)
            .where(eq(childAccount.userId, userId))
            .orderBy(asc(childAccount.connectedAt));
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return this.mapRows(rows, "listForUser");
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("listForUser"));
        }
      },
    );
  }

  async deleteLeased(lease: SyncLease): Promise<Result<void, ChildrenError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleChildRepository > deleteLeased" },
      async () => {
        try {
          const query = exec
            .delete(childAccount)
            .where(leaseHeldBy(lease))
            .returning({ id: childAccount.id });
          const deleted = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          if (deleted.length === 0) return Result.fail(leaseLost);

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("deleteLeased"));
        }
      },
    );
  }

  async claimDue(
    limit: number,
    now: Date,
    leaseMs: number,
  ): Promise<Result<DueChild[], ChildrenError>> {
    const claimed = await this.claim("claimDue", "connected", limit, now, leaseMs);
    return claimed.map((rows) =>
      rows.map(({ childId, userId, label, lease }) => ({ childId, userId, label, lease })),
    );
  }

  async claimDisconnecting(
    limit: number,
    now: Date,
    leaseMs: number,
  ): Promise<Result<DisconnectingChild[], ChildrenError>> {
    const claimed = await this.claim("claimDisconnecting", "disconnecting", limit, now, leaseMs);
    return claimed.map((rows) =>
      rows.map(({ childId, userId, linkedAccountId, lease }) => ({
        childId,
        userId,
        linkedAccountId,
        lease,
      })),
    );
  }

  async markSynced(
    lease: SyncLease,
    at: Date,
    nextSyncAt: Date,
  ): Promise<Result<void, ChildrenError>> {
    return this.updateOne(
      "markSynced",
      leaseHeldBy(lease),
      { lastSyncedAt: at, nextSyncAt, syncStartedAt: null, syncAttempts: 0 },
      leaseLost,
    );
  }

  async markSyncFailed(lease: SyncLease, nextSyncAt: Date): Promise<Result<void, ChildrenError>> {
    return this.releaseLease(lease, nextSyncAt);
  }

  async releaseLease(lease: SyncLease, retryAt: Date): Promise<Result<void, ChildrenError>> {
    return this.updateOne(
      "releaseLease",
      leaseHeldBy(lease),
      { nextSyncAt: retryAt, syncStartedAt: null },
      leaseLost,
    );
  }

  private async claim(
    method: string,
    status: ChildStatusValue,
    limit: number,
    now: Date,
    leaseMs: number,
  ) {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: `DrizzleChildRepository > ${method}` },
      async (): Promise<Result<ClaimedRow[], ChildrenError>> => {
        try {
          const due = exec
            .select({ id: childAccount.id })
            .from(childAccount)
            .where(and(eq(childAccount.status, status), lte(childAccount.nextSyncAt, now)))
            .orderBy(asc(childAccount.nextSyncAt))
            .limit(limit)
            .for("update", { skipLocked: true });
          const query = exec
            .update(childAccount)
            .set({
              syncAttempts: sql`${childAccount.syncAttempts} + 1`,
              syncLease: sql`${childAccount.syncLease} + 1`,
              syncStartedAt: status === "connected" ? now : null,
              nextSyncAt: new Date(now.getTime() + leaseMs),
            })
            .where(inArray(childAccount.id, due))
            .returning({
              childId: childAccount.id,
              userId: childAccount.userId,
              linkedAccountId: childAccount.linkedAccountId,
              label: childAccount.label,
              lease: childAccount.syncLease,
            });
          const claimed = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(claimed);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure(method));
        }
      },
    );
  }

  private async updateOne(
    method: string,
    where: ReturnType<typeof and>,
    values: Partial<typeof childAccount.$inferInsert>,
    missing: ChildrenError,
  ): Promise<Result<void, ChildrenError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: `DrizzleChildRepository > ${method}` },
      async () => {
        try {
          const query = exec
            .update(childAccount)
            .set(values)
            .where(where)
            .returning({ id: childAccount.id });
          const updated = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          if (updated.length === 0) return Result.fail(missing);

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure(method));
        }
      },
    );
  }

  private async findOne(
    method: string,
    where: ReturnType<typeof and>,
  ): Promise<Result<Option<ChildAccount>, ChildrenError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: `DrizzleChildRepository > ${method}` },
      async () => {
        try {
          const query = exec.select().from(childAccount).where(where).limit(1).for("update");
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return this.mapRows(rows, method).map((children) => Option.fromNullable(children[0]));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure(method));
        }
      },
    );
  }

  private mapRows(rows: ChildRow[], method: string): Result<ChildAccount[], ChildrenError> {
    const children: ChildAccount[] = [];
    for (const row of rows) {
      const mapped = toDomain(row);
      if (mapped.isFailure) {
        this.instrumentation.capture(new Error(`child_account ${row.id}: ${mapped.getError()}`));
        return Result.fail(repositoryFailure(method));
      }
      children.push(mapped.getValue());
    }
    return Result.ok(children);
  }
}
