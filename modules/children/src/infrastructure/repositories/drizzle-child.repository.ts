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
  DueChild,
  IChildRepository,
} from "../../application/ports/child-repository.port";
import { ChildAccount } from "../../domain/child-account.aggregate";
import { ChildAccountId } from "../../domain/child-account-id";
import { ChildLabel } from "../../domain/value-objects/child-label.vo";
import { ChildStatus } from "../../domain/value-objects/child-status.vo";
import { GoogleEmail } from "../../domain/value-objects/google-email.vo";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("CHILD_PROVIDER_FAILURE");

type ChildRow = typeof childAccount.$inferSelect;

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
      },
      id.getValue(),
    ),
  );
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

  async delete(userId: string, childId: string): Promise<Result<void, ChildrenError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan({ name: "DrizzleChildRepository > delete" }, async () => {
      try {
        const query = exec
          .delete(childAccount)
          .where(and(eq(childAccount.id, childId), eq(childAccount.userId, userId)));
        await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok();
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(repositoryFailure("delete"));
      }
    });
  }

  async claimDue(
    limit: number,
    now: Date,
    leaseMs: number,
  ): Promise<Result<DueChild[], ChildrenError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleChildRepository > claimDue" },
      async () => {
        try {
          const due = exec
            .select({ id: childAccount.id })
            .from(childAccount)
            .where(and(eq(childAccount.status, "connected"), lte(childAccount.nextSyncAt, now)))
            .orderBy(asc(childAccount.nextSyncAt))
            .limit(limit)
            .for("update", { skipLocked: true });
          const query = exec
            .update(childAccount)
            .set({
              syncAttempts: sql`${childAccount.syncAttempts} + 1`,
              syncStartedAt: now,
              nextSyncAt: new Date(now.getTime() + leaseMs),
            })
            .where(inArray(childAccount.id, due))
            .returning({
              childId: childAccount.id,
              userId: childAccount.userId,
              label: childAccount.label,
            });
          const claimed = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(claimed);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("claimDue"));
        }
      },
    );
  }

  async markSynced(
    childId: string,
    at: Date,
    nextSyncAt: Date,
  ): Promise<Result<void, ChildrenError>> {
    return this.updateOne("markSynced", eq(childAccount.id, childId), {
      lastSyncedAt: at,
      nextSyncAt,
      syncStartedAt: null,
      syncAttempts: 0,
    });
  }

  async markSyncFailed(childId: string, nextSyncAt: Date): Promise<Result<void, ChildrenError>> {
    return this.updateOne("markSyncFailed", eq(childAccount.id, childId), {
      nextSyncAt,
      syncStartedAt: null,
    });
  }

  private async updateOne(
    method: string,
    where: ReturnType<typeof and>,
    values: Partial<typeof childAccount.$inferInsert>,
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
          if (updated.length === 0)
            return Result.fail({
              code: "CHILD_NOT_FOUND",
              message: "Cet enfant n'existe pas ou n'est plus relié à votre compte.",
            });

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
