import { type AppError, type IInstrumentation, type IUnitOfWork, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { Alert } from "../../domain/alert.aggregate";
import type { AlertContext, IAlertContextReader } from "../ports/alert-context-reader.port";
import type { IAlertEmailSender } from "../ports/alert-email-sender.port";
import type {
  AlertLease,
  ClaimedAlert,
  DeliveryChannel,
  IAlertRepository,
} from "../ports/alert-repository.port";
import type { IEventDeadlines } from "../ports/event-deadlines.port";
import type { IPushSender, PushOptions, PushPayload } from "../ports/push-sender.port";
import type {
  IPushSubscriptionRepository,
  PushSubscriptionRecord,
} from "../ports/push-subscription-repository.port";

export const DISPATCH_BATCH = 50;
export const DISPATCH_LEASE_SECONDS = 60;
export const MAX_ATTEMPTS = 5;
export const PUSH_TTL_SECONDS = 2 * 3600;

export interface DispatchOutcome {
  claimed: number;
  sent: number;
  emailed: number;
  missed: number;
}

type Delivered = "push" | "email" | "missed" | "none";

function pushPayload(context: AlertContext): PushPayload {
  return {
    web_push: 8030,
    notification: {
      title: context.eventTitle,
      body: `${context.childLabel}, échéance ${context.deadlineLabel}`,
      navigate: context.eventUrl,
    },
  };
}

function pushOptions(alert: Alert): PushOptions {
  return {
    urgency: "high",
    ttlSeconds: PUSH_TTL_SECONDS,
    topic: alert.id.value.replaceAll("-", ""),
  };
}

export class AlertDispatchService {
  constructor(
    private readonly alerts: IAlertRepository,
    private readonly subscriptions: IPushSubscriptionRepository,
    private readonly push: IPushSender,
    private readonly email: IAlertEmailSender,
    private readonly contexts: IAlertContextReader,
    private readonly deadlines: IEventDeadlines,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async runOnce(now: Date): Promise<Result<DispatchOutcome, AppError>> {
    return this.instrumentation.startSpan(
      { name: "AlertDispatchService > runOnce", op: "function" },
      async () => {
        const claimed = await this.alerts.claimDue(now, DISPATCH_BATCH, DISPATCH_LEASE_SECONDS);
        if (claimed.isFailure) return Result.fail(claimed.getError());

        const batch = claimed.getValue();
        const outcome: DispatchOutcome = { claimed: batch.length, sent: 0, emailed: 0, missed: 0 };
        if (batch.length === 0) return Result.ok(outcome);

        const contexts = await this.contexts.load(batch.map(({ lease }) => lease.alertId));
        if (contexts.isFailure) return Result.fail(contexts.getError());
        const byAlert = new Map(contexts.getValue().map((context) => [context.alertId, context]));

        for (const item of batch) {
          const delivered = await this.dispatch(item, byAlert.get(item.lease.alertId), now);
          if (delivered.isFailure) {
            this.instrumentation.capture(
              new Error(`alert ${item.lease.alertId}: ${delivered.getError().code}`),
            );
            continue;
          }
          if (delivered.getValue() === "push") outcome.sent += 1;
          if (delivered.getValue() === "email") outcome.emailed += 1;
          if (delivered.getValue() === "missed") outcome.missed += 1;
        }
        return Result.ok(outcome);
      },
    );
  }

  private async dispatch(
    { alert, lease }: ClaimedAlert,
    context: AlertContext | undefined,
    now: Date,
  ): Promise<Result<Delivered, AppError>> {
    const verdict = alert.verdict(now);
    if (verdict === "wait") return Result.ok("none");
    if (verdict === "missed") return this.giveUp(alert, lease);
    if (verdict === "skipped" || !context) return this.skip(alert, lease);

    const shown = await this.deadlines.forUser(alert.get("userId"), alert.get("eventId"));
    if (shown.isFailure) return Result.fail(shown.getError());
    if (shown.getValue().isNone()) return this.skip(alert, lease);

    const pushed = await this.pushAll(alert, context);
    if (pushed.isFailure) return Result.fail(pushed.getError());
    if (pushed.getValue()) return this.markSent(alert, lease, "push", now);

    const emailed = await this.email.send(context.email, {
      alertId: alert.id.value,
      eventTitle: context.eventTitle,
      childLabel: context.childLabel,
      deadlineLabel: context.deadlineLabel,
      eventUrl: context.eventUrl,
    });
    if (emailed.isSuccess) return this.markSent(alert, lease, "email", now);

    return this.emailFailed(alert, lease, emailed.getError().code, now);
  }

  private async pushAll(alert: Alert, context: AlertContext): Promise<Result<boolean, AppError>> {
    const userId = alert.get("userId");
    const live = await this.subscriptions.listForUser(userId);
    if (live.isFailure) return Result.fail(live.getError());

    let delivered = false;
    for (const subscription of live.getValue()) {
      const sent = await this.push.send(subscription, pushPayload(context), pushOptions(alert));
      if (sent.isSuccess) {
        delivered = true;
        continue;
      }

      const recorded =
        sent.getError() === "PUSH_GONE"
          ? await this.expire(subscription)
          : await this.pushFailed(alert);
      if (recorded.isFailure) return Result.fail(recorded.getError());
    }
    return Result.ok(delivered);
  }

  private expire(subscription: PushSubscriptionRecord): Promise<Result<void, AppError>> {
    return this.transactions.run(async (): Promise<Result<void, AppError>> => {
      const deleted = await this.subscriptions.deleteGone(subscription.userId, subscription.id);
      if (deleted.isFailure) return deleted;

      await emitEvent(
        this.outbox,
        EventTypes.PUSH_SUBSCRIPTION_EXPIRED,
        "push_subscription",
        subscription.id,
        {
          userId: subscription.userId,
          subscriptionId: subscription.id,
          actorUserId: null,
        },
      );
      return Result.ok();
    });
  }

  private async pushFailed(alert: Alert): Promise<Result<void, AppError>> {
    await this.emitFailure(alert, "push", "PUSH_FAILED");
    return Result.ok();
  }

  private markSent(
    alert: Alert,
    lease: AlertLease,
    channel: DeliveryChannel,
    now: Date,
  ): Promise<Result<Delivered, AppError>> {
    return this.transactions.run(async (): Promise<Result<Delivered, AppError>> => {
      alert.markSent(now);
      const settled = await this.alerts.settle(alert, lease);
      if (settled.isFailure) return Result.fail(settled.getError());
      if (!settled.getValue()) return Result.ok("none");

      const recorded = await this.alerts.recordDelivery({
        alertId: alert.id.value,
        channel,
        outcome: "sent",
        at: now,
      });
      if (recorded.isFailure) return Result.fail(recorded.getError());

      await emitEvent(this.outbox, EventTypes.ALERT_SENT, "alert", alert.id.value, {
        userId: alert.get("userId"),
        alertId: alert.id.value,
        channel,
        actorUserId: null,
      });
      return Result.ok(channel);
    });
  }

  private emailFailed(
    alert: Alert,
    lease: AlertLease,
    code: string,
    now: Date,
  ): Promise<Result<Delivered, AppError>> {
    return this.transactions.run(async (): Promise<Result<Delivered, AppError>> => {
      const recorded = await this.alerts.recordDelivery({
        alertId: alert.id.value,
        channel: "email",
        outcome: "failed",
        at: now,
      });
      if (recorded.isFailure) return Result.fail(recorded.getError());

      await this.emitFailure(alert, "email", code);
      if (lease.attempts < MAX_ATTEMPTS) return Result.ok("none");

      alert.markMissed();
      const settled = await this.alerts.settle(alert, lease);
      return settled.map((held) => (held ? "missed" : "none"));
    });
  }

  private async giveUp(alert: Alert, lease: AlertLease): Promise<Result<Delivered, AppError>> {
    alert.markMissed();
    const settled = await this.alerts.settle(alert, lease);
    return settled.map((held) => (held ? "missed" : "none"));
  }

  private async skip(alert: Alert, lease: AlertLease): Promise<Result<Delivered, AppError>> {
    alert.skip();
    const settled = await this.alerts.settle(alert, lease);
    return settled.map(() => "none");
  }

  private async emitFailure(alert: Alert, channel: DeliveryChannel, code: string): Promise<void> {
    await emitEvent(this.outbox, EventTypes.ALERT_DELIVERY_FAILED, "alert", alert.id.value, {
      userId: alert.get("userId"),
      alertId: alert.id.value,
      channel,
      code,
      actorUserId: null,
    });
  }
}
