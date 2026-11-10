import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { and, count, dbOperationFailure, eq, resolveExecutor } from "@packages/drizzle";
import { pushSubscription } from "../../../schemas/push-subscription.schema";
import type { AlertsError } from "../../application/ports/alert-repository.port";
import type {
  IPushSubscriptionRepository,
  NewPushSubscription,
  PushSubscriptionRecord,
} from "../../application/ports/push-subscription-repository.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("PUSH_PROVIDER_FAILURE");

export class DrizzlePushSubscriptionRepository implements IPushSubscriptionRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async upsert(subscription: NewPushSubscription): Promise<Result<string, AlertsError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzlePushSubscriptionRepository > upsert" },
      async () => {
        try {
          const keys = {
            userId: subscription.userId,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
            userAgent: subscription.userAgent.toNull(),
            lastSeenAt: subscription.now,
          };
          const query = exec
            .insert(pushSubscription)
            .values({ endpoint: subscription.endpoint, createdAt: subscription.now, ...keys })
            .onConflictDoUpdate({ target: pushSubscription.endpoint, set: keys })
            .returning({ id: pushSubscription.id });
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          if (!row) return Result.fail(repositoryFailure("upsert"));

          return Result.ok(row.id);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("upsert"));
        }
      },
    );
  }

  async deleteOwned(userId: string, endpoint: string): Promise<Result<void, AlertsError>> {
    return this.remove(
      "deleteOwned",
      and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)),
    );
  }

  async deleteGone(userId: string, subscriptionId: string): Promise<Result<void, AlertsError>> {
    return this.remove(
      "deleteGone",
      and(eq(pushSubscription.userId, userId), eq(pushSubscription.id, subscriptionId)),
    );
  }

  async listForUser(userId: string): Promise<Result<PushSubscriptionRecord[], AlertsError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzlePushSubscriptionRepository > listForUser" },
      async () => {
        try {
          const query = exec
            .select({
              id: pushSubscription.id,
              userId: pushSubscription.userId,
              endpoint: pushSubscription.endpoint,
              p256dh: pushSubscription.p256dh,
              auth: pushSubscription.auth,
            })
            .from(pushSubscription)
            .where(eq(pushSubscription.userId, userId));
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(rows);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("listForUser"));
        }
      },
    );
  }

  async countForUser(userId: string): Promise<Result<number, AlertsError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzlePushSubscriptionRepository > countForUser" },
      async () => {
        try {
          const query = exec
            .select({ live: count() })
            .from(pushSubscription)
            .where(eq(pushSubscription.userId, userId));
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(row?.live ?? 0);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("countForUser"));
        }
      },
    );
  }

  private async remove(
    method: string,
    where: ReturnType<typeof and>,
  ): Promise<Result<void, AlertsError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: `DrizzlePushSubscriptionRepository > ${method}` },
      async () => {
        try {
          const query = exec.delete(pushSubscription).where(where);
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure(method));
        }
      },
    );
  }
}
