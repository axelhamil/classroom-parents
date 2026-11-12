import { type IInstrumentation, type IUnitOfWork, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import {
  type PushStatusDto,
  type PushSubscriptionInput,
  pushSubscriptionSchema,
} from "../dto/push-subscription.dto";
import type { AlertsError } from "../ports/alert-repository.port";
import type { IPushSubscriptionRepository } from "../ports/push-subscription-repository.port";

const subscriptionInvalid: AlertsError = {
  code: "PUSH_SUBSCRIPTION_INVALID",
  message:
    "Ce navigateur a renvoyé un abonnement aux notifications illisible. Réactivez les notifications.",
};

export class PushSubscriptionService {
  constructor(
    private readonly subscriptions: IPushSubscriptionRepository,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async subscribe(
    userId: string,
    input: PushSubscriptionInput,
  ): Promise<Result<void, AlertsError>> {
    return this.span("subscribe", async () => {
      const parsed = pushSubscriptionSchema.safeParse(input);
      if (!parsed.success) return Result.fail(subscriptionInvalid);

      const { endpoint, keys, userAgent, sessionId } = parsed.data;
      return this.transactions.run(async (): Promise<Result<void, AlertsError>> => {
        const stored = await this.subscriptions.upsert({
          userId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: Option.fromNullable(userAgent),
          sessionId: Option.fromNullable(sessionId),
          now: this.clock(),
        });
        if (stored.isFailure) return Result.fail(stored.getError());

        const { id: subscriptionId, previousUserId } = stored.getValue();
        const takenFrom = previousUserId.filter((previous) => previous !== userId);
        if (takenFrom.isSome()) {
          await emitEvent(
            this.outbox,
            EventTypes.PUSH_UNSUBSCRIBED,
            "push_subscription",
            subscriptionId,
            { userId: takenFrom.unwrap(), subscriptionId, actorUserId: userId },
          );
        }

        await emitEvent(
          this.outbox,
          EventTypes.PUSH_SUBSCRIBED,
          "push_subscription",
          subscriptionId,
          {
            userId,
            subscriptionId,
          },
        );
        return Result.ok();
      });
    });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<Result<void, AlertsError>> {
    return this.span("unsubscribe", () =>
      this.transactions.run(async (): Promise<Result<void, AlertsError>> => {
        const deleted = await this.subscriptions.deleteOwned(userId, endpoint);
        if (deleted.isFailure) return Result.fail(deleted.getError());
        if (deleted.getValue().isNone()) return Result.ok();

        const subscriptionId = deleted.getValue().unwrap();
        await emitEvent(
          this.outbox,
          EventTypes.PUSH_UNSUBSCRIBED,
          "push_subscription",
          subscriptionId,
          { userId, subscriptionId, actorUserId: userId },
        );
        return Result.ok();
      }),
    );
  }

  async forgetSession(userId: string, sessionId: string): Promise<Result<void, AlertsError>> {
    return this.span("forgetSession", () =>
      this.transactions.run(async (): Promise<Result<void, AlertsError>> => {
        const deleted = await this.subscriptions.deleteForSession(userId, sessionId);
        if (deleted.isFailure) return Result.fail(deleted.getError());

        for (const subscriptionId of deleted.getValue()) {
          await emitEvent(
            this.outbox,
            EventTypes.PUSH_UNSUBSCRIBED,
            "push_subscription",
            subscriptionId,
            { userId, subscriptionId, actorUserId: userId },
          );
        }
        return Result.ok();
      }),
    );
  }

  async status(userId: string): Promise<Result<PushStatusDto, AlertsError>> {
    return this.span("status", async () =>
      (await this.subscriptions.countForUser(userId)).map((live) => ({ live })),
    );
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `PushSubscriptionService > ${method}`, op: "function" },
      work,
    );
  }
}
