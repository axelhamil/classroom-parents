import { type AppError, type IUnitOfWork, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { IPushSender, PushMessage, PushOptions } from "../ports/push-sender.port";
import type {
  IPushSubscriptionRepository,
  PushSubscriptionRecord,
} from "../ports/push-subscription-repository.port";

export interface PushFanoutPorts {
  subscriptions: IPushSubscriptionRepository;
  push: IPushSender;
  transactions: IUnitOfWork;
  outbox: IOutboxRepository;
}

export interface PushFanout {
  delivered: boolean;
  failed: number;
}

function expire(
  ports: PushFanoutPorts,
  subscription: PushSubscriptionRecord,
): Promise<Result<void, AppError>> {
  return ports.transactions.run(async (): Promise<Result<void, AppError>> => {
    const deleted = await ports.subscriptions.deleteGone(subscription.userId, subscription.id);
    if (deleted.isFailure) return deleted;

    await emitEvent(
      ports.outbox,
      EventTypes.PUSH_SUBSCRIPTION_EXPIRED,
      "push_subscription",
      subscription.id,
      { userId: subscription.userId, subscriptionId: subscription.id, actorUserId: null },
    );
    return Result.ok();
  });
}

export async function pushToParent(
  ports: PushFanoutPorts,
  userId: string,
  message: PushMessage,
  options: PushOptions,
): Promise<Result<PushFanout, AppError>> {
  const live = await ports.subscriptions.listForUser(userId);
  if (live.isFailure) return Result.fail(live.getError());

  const outcomes = await Promise.all(
    live.getValue().map(async (subscription) => ({
      subscription,
      sent: await ports.push.send(subscription, message, options),
    })),
  );

  const fanout: PushFanout = { delivered: false, failed: 0 };
  for (const { subscription, sent } of outcomes) {
    if (sent.isSuccess) {
      fanout.delivered = true;
      continue;
    }
    if (sent.getError() !== "PUSH_GONE") {
      fanout.failed += 1;
      continue;
    }

    const expired = await expire(ports, subscription);
    if (expired.isFailure) return Result.fail(expired.getError());
  }
  return Result.ok(fanout);
}
