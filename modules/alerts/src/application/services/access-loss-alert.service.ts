import {
  type AppError,
  type IInstrumentation,
  type IUnitOfWork,
  mapBounded,
  Result,
} from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { notificationRef } from "@packages/events/notification-ref";
import { emitEvent, emitEvents } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { AlertTime } from "../../domain/value-objects/alert-time.vo";
import { QuietHours } from "../../domain/value-objects/quiet-hours.vo";
import {
  DISPATCH_BATCH,
  DISPATCH_CONCURRENCY,
  DISPATCH_LEASE_SECONDS,
  emailRetryAfter,
} from "../config/dispatch-budget";
import type {
  AccessLossContext,
  IAccessLossContextReader,
} from "../ports/access-loss-context.port";
import type {
  AccessLossChild,
  AccessLossSettlement,
  ClaimedAccessLoss,
  IAccessLossRepository,
} from "../ports/access-loss-repository.port";
import type { IAlertEmailSender } from "../ports/alert-email-sender.port";
import type { AlertsError, DeliveryChannel } from "../ports/alert-repository.port";
import type { IPushCopy } from "../ports/push-copy.port";
import type { IPushSender } from "../ports/push-sender.port";
import {
  type IPushSubscriptionRepository,
  LOCK_SCREEN_DETAILS_BY_DEFAULT,
} from "../ports/push-subscription-repository.port";
import type { IReminderSettingsRepository } from "../ports/reminder-settings.port";
import { pushToParent } from "./push-fanout";

export const ACCESS_LOSS_PUSH_TTL_SECONDS = 24 * 3600;

const CHILDREN_PATH = "/children";

export interface AccessLossOutcome {
  claimed: number;
  sent: number;
  emailed: number;
  missed: number;
  cancelled: number;
}

type Delivered = "push" | "email" | "missed" | "cancelled" | "none";

function unplannable(child: AccessLossChild, reason: string): AlertsError {
  return {
    code: "ALERT_PROVIDER_FAILURE",
    message: `access loss of child ${child.childId}: ${reason}`,
  };
}

export class AccessLossAlertService {
  constructor(
    private readonly losses: IAccessLossRepository,
    private readonly settings: IReminderSettingsRepository,
    private readonly contexts: IAccessLossContextReader,
    private readonly subscriptions: IPushSubscriptionRepository,
    private readonly push: IPushSender,
    private readonly email: IAlertEmailSender,
    private readonly copy: IPushCopy,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly appOrigin: string,
  ) {}

  async warn(child: AccessLossChild, now: Date): Promise<Result<void, AppError>> {
    return this.span("warn", async () => {
      const dueAt = await this.firstRingAfter(child, now);
      if (dueAt.isFailure) return Result.fail(dueAt.getError());

      return this.transactions.run(async (): Promise<Result<void, AppError>> => {
        const opened = await this.losses.open(child, dueAt.getValue());
        if (opened.isFailure) return Result.fail(opened.getError());
        if (opened.getValue().isNone()) return Result.ok();

        const accessAlertId = opened.getValue().unwrap();
        await emitEvent(
          this.outbox,
          EventTypes.ACCESS_LOSS_ALERT_SCHEDULED,
          "access_loss_alert",
          accessAlertId,
          { ...child, accessAlertId, dueAt: dueAt.getValue().toISOString(), actorUserId: null },
        );
        return Result.ok();
      });
    });
  }

  async rearm(child: AccessLossChild, now: Date): Promise<Result<void, AppError>> {
    return this.span("rearm", () =>
      this.transactions.run(async (): Promise<Result<void, AppError>> => {
        const closed = await this.losses.close(child, now);
        if (closed.isFailure) return Result.fail(closed.getError());

        await emitEvents(
          this.outbox,
          "access_loss_alert",
          closed.getValue().map(({ accessAlertId, cancelled }) => ({
            eventType: EventTypes.ACCESS_LOSS_ALERT_CLOSED,
            aggregateId: accessAlertId,
            payload: { ...child, accessAlertId, cancelled, actorUserId: null },
          })),
        );
        return Result.ok();
      }),
    );
  }

  async runOnce(now: Date): Promise<Result<AccessLossOutcome, AppError>> {
    return this.span("runOnce", async () => {
      const claimed = await this.losses.claimDue(now, DISPATCH_BATCH, DISPATCH_LEASE_SECONDS);
      if (claimed.isFailure) return Result.fail(claimed.getError());

      const batch = claimed.getValue();
      const delivered = await mapBounded(batch, DISPATCH_CONCURRENCY, async (loss) => ({
        loss,
        result: await this.dispatch(loss, now),
      }));
      return Result.ok(this.tally(batch.length, delivered));
    });
  }

  private async firstRingAfter(child: AccessLossChild, now: Date): Promise<Result<Date, AppError>> {
    const quiet = await this.settings.quietHoursFor(child.userId);
    if (quiet.isFailure) return Result.fail(quiet.getError());

    const ring = AlertTime.fromInstant(now).flatMap((wall) =>
      quiet.getValue().unwrapOr(QuietHours.defaults()).ringAfter(wall),
    );
    if (ring.isFailure) return Result.fail(unplannable(child, ring.getError()));

    return Result.ok(ring.getValue().value.at);
  }

  private async dispatch(loss: ClaimedAccessLoss, now: Date): Promise<Result<Delivered, AppError>> {
    const context = await this.contexts.stillLost(loss.userId, loss.childId);
    if (context.isFailure) return Result.fail(context.getError());
    if (context.getValue().isNone()) return this.cancel(loss, now);

    const pushed = await this.pushTo(loss, context.getValue().unwrap());
    if (pushed.isFailure) return Result.fail(pushed.getError());
    if (pushed.getValue()) return this.markSent(loss, "push", now);

    return this.emailTo(loss, context.getValue().unwrap(), now);
  }

  private async pushTo(
    loss: ClaimedAccessLoss,
    { childLabel }: AccessLossContext,
  ): Promise<Result<boolean, AppError>> {
    const details = await this.subscriptions.lockScreenDetailsFor(loss.userId);
    if (details.isFailure) return Result.fail(details.getError());

    const text = await this.copy.forAccessLoss(childLabel, {
      details: details.getValue().unwrapOr(LOCK_SCREEN_DETAILS_BY_DEFAULT),
    });
    const ports = {
      subscriptions: this.subscriptions,
      push: this.push,
      transactions: this.transactions,
      outbox: this.outbox,
    };
    const fanout = await pushToParent(
      ports,
      loss.userId,
      {
        ...text,
        url: this.childrenUrl(),
        tag: `access-${loss.childId}`,
        notificationRef: notificationRef.accessLoss(loss.lease.accessAlertId),
      },
      {
        ttlSeconds: ACCESS_LOSS_PUSH_TTL_SECONDS,
        topic: loss.lease.accessAlertId.replaceAll("-", ""),
        urgency: "high",
      },
    );
    return fanout.map(({ delivered }) => delivered);
  }

  private async emailTo(
    loss: ClaimedAccessLoss,
    { email, childLabel }: AccessLossContext,
    now: Date,
  ): Promise<Result<Delivered, AppError>> {
    const queued = await this.transactions.run(async (): Promise<Result<Delivered, AppError>> => {
      const sent = await this.markSent(loss, "email", now);
      if (sent.isFailure || sent.getValue() === "none") return sent;

      const emailed = await this.email.sendAccessLoss(email, {
        accessAlertId: loss.lease.accessAlertId,
        childLabel,
        childrenUrl: this.childrenUrl(),
      });
      return emailed.map((): Delivered => "email");
    });
    if (queued.isSuccess) return queued;

    return this.emailFailed(loss, queued.getError().code);
  }

  private emailFailed(loss: ClaimedAccessLoss, code: string): Promise<Result<Delivered, AppError>> {
    const retry = emailRetryAfter(code, loss.failures);
    if (retry === "wait") return Promise.resolve(Result.ok("none"));
    if (retry === "give_up")
      return this.settle(loss, { status: "missed" }, "missed", EventTypes.ACCESS_LOSS_ALERT_MISSED);

    return this.losses
      .addFailure(loss.lease)
      .then((counted) => counted.map((): Delivered => "none"));
  }

  private markSent(
    loss: ClaimedAccessLoss,
    channel: DeliveryChannel,
    now: Date,
  ): Promise<Result<Delivered, AppError>> {
    return this.settle(
      loss,
      { status: "sent", channel, at: now },
      channel,
      EventTypes.ACCESS_LOSS_ALERT_SENT,
      { channel },
    );
  }

  private cancel(loss: ClaimedAccessLoss, now: Date): Promise<Result<Delivered, AppError>> {
    return this.settle(
      loss,
      { status: "cancelled", at: now },
      "cancelled",
      EventTypes.ACCESS_LOSS_ALERT_CLOSED,
      { cancelled: true },
    );
  }

  private settle(
    loss: ClaimedAccessLoss,
    settlement: AccessLossSettlement,
    outcome: Delivered,
    eventType:
      | typeof EventTypes.ACCESS_LOSS_ALERT_SENT
      | typeof EventTypes.ACCESS_LOSS_ALERT_MISSED
      | typeof EventTypes.ACCESS_LOSS_ALERT_CLOSED,
    extra: Record<string, unknown> = {},
  ): Promise<Result<Delivered, AppError>> {
    return this.transactions.run(async (): Promise<Result<Delivered, AppError>> => {
      const settled = await this.losses.settle(loss.lease, settlement);
      if (settled.isFailure) return Result.fail(settled.getError());
      if (!settled.getValue()) return Result.ok("none");

      const { userId, childId } = loss;
      const accessAlertId = loss.lease.accessAlertId;
      await emitEvent(this.outbox, eventType, "access_loss_alert", accessAlertId, {
        userId,
        childId,
        accessAlertId,
        ...extra,
        actorUserId: null,
      });
      return Result.ok(outcome);
    });
  }

  private tally(
    claimed: number,
    delivered: { loss: ClaimedAccessLoss; result: Result<Delivered, AppError> }[],
  ): AccessLossOutcome {
    const outcome: AccessLossOutcome = { claimed, sent: 0, emailed: 0, missed: 0, cancelled: 0 };
    for (const { loss, result } of delivered) {
      if (result.isFailure) {
        this.instrumentation.capture(
          new Error(`access loss alert ${loss.lease.accessAlertId}: ${result.getError().code}`),
        );
        continue;
      }
      if (result.getValue() === "push") outcome.sent += 1;
      if (result.getValue() === "email") outcome.emailed += 1;
      if (result.getValue() === "missed") outcome.missed += 1;
      if (result.getValue() === "cancelled") outcome.cancelled += 1;
    }
    return outcome;
  }

  private childrenUrl(): string {
    return new URL(CHILDREN_PATH, this.appOrigin).toString();
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `AccessLossAlertService > ${method}`, op: "function" },
      work,
    );
  }
}
