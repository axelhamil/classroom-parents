import {
  type AppError,
  type IInstrumentation,
  type IUnitOfWork,
  mapBounded,
  Result,
} from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { Alert } from "../../domain/alert.aggregate";
import {
  DISPATCH_BATCH,
  DISPATCH_CONCURRENCY,
  DISPATCH_LEASE_SECONDS,
  emailRetryAfter,
} from "../config/dispatch-budget";
import type { AlertContext, IAlertContextReader } from "../ports/alert-context-reader.port";
import type { IAlertEmailSender } from "../ports/alert-email-sender.port";
import type {
  AlertLease,
  ClaimedAlert,
  DeliveryChannel,
  IAlertRepository,
} from "../ports/alert-repository.port";
import type { IEventDeadlines } from "../ports/event-deadlines.port";
import type { IPushCopy } from "../ports/push-copy.port";
import type { IPushSender, PushMessage } from "../ports/push-sender.port";
import {
  type IPushSubscriptionRepository,
  LOCK_SCREEN_DETAILS_BY_DEFAULT,
} from "../ports/push-subscription-repository.port";
import { pushToParent } from "./push-fanout";

export const PUSH_TTL_SECONDS = 2 * 3600;

export const GROUP_WINDOW_MS = 30 * 60_000;

export interface DispatchOutcome {
  claimed: number;
  sent: number;
  emailed: number;
  missed: number;
}

type Delivered = "push" | "email" | "missed" | "none";

interface Deliverable {
  item: ClaimedAlert;
  context: AlertContext;
}

interface Settled {
  alertId: string;
  delivered: Result<Delivered, AppError>;
}

function dueAt({ item }: Deliverable): number {
  return item.alert.get("time").value.at.getTime();
}

function windows(ready: Deliverable[]): Deliverable[][] {
  const byUser = Map.groupBy(ready, ({ item }) => item.alert.get("userId"));
  const groups: Deliverable[][] = [];
  for (const alerts of byUser.values()) {
    let open: Deliverable[] = [];
    for (const deliverable of alerts.toSorted((a, b) => dueAt(a) - dueAt(b))) {
      const first = open[0];
      if (first && dueAt(deliverable) - dueAt(first) >= GROUP_WINDOW_MS) {
        groups.push(open);
        open = [];
      }
      open.push(deliverable);
    }
    if (open.length > 0) groups.push(open);
  }
  return groups;
}

function hex(id: string): string {
  return id.replaceAll("-", "");
}

function addressing(group: Deliverable[]): Pick<PushMessage, "url" | "tag"> & { topic: string } {
  const [only] = group;
  if (only && group.length === 1) {
    const eventId = only.item.alert.get("eventId");
    return { url: only.context.eventUrl, tag: `event-${eventId}`, topic: hex(eventId) };
  }

  const opening = group[0]?.item.alert.get("time").value;
  const slot = `${opening?.date ?? ""}-${opening?.time ?? ""}`;
  return {
    url: new URL("/", group[0]?.context.eventUrl).toString(),
    tag: `alerts-${slot}`,
    topic: `alerts${slot.replace(/\D/g, "")}`,
  };
}

export class AlertDispatchService {
  constructor(
    private readonly alerts: IAlertRepository,
    private readonly subscriptions: IPushSubscriptionRepository,
    private readonly push: IPushSender,
    private readonly email: IAlertEmailSender,
    private readonly contexts: IAlertContextReader,
    private readonly copy: IPushCopy,
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

        const screened = await mapBounded(batch, DISPATCH_CONCURRENCY, async (item) => ({
          item,
          context: byAlert.get(item.lease.alertId),
          verdict: await this.screen(item, byAlert.get(item.lease.alertId), now),
        }));
        const ready: Deliverable[] = [];
        const settled: Settled[] = [];
        for (const { item, context, verdict } of screened) {
          if (verdict.isSuccess && verdict.getValue() === "ready" && context) {
            ready.push({ item, context });
            continue;
          }
          settled.push({
            alertId: item.lease.alertId,
            delivered: verdict.map((value) => (value === "ready" ? "none" : value)),
          });
        }

        const delivered = await mapBounded(windows(ready), DISPATCH_CONCURRENCY, (group) =>
          this.deliver(group, now),
        );
        for (const { alertId, delivered: result } of [...settled, ...delivered.flat()]) {
          if (result.isFailure) {
            this.instrumentation.capture(new Error(`alert ${alertId}: ${result.getError().code}`));
            continue;
          }
          if (result.getValue() === "push") outcome.sent += 1;
          if (result.getValue() === "email") outcome.emailed += 1;
          if (result.getValue() === "missed") outcome.missed += 1;
        }
        return Result.ok(outcome);
      },
    );
  }

  private async screen(
    { alert, lease }: ClaimedAlert,
    context: AlertContext | undefined,
    now: Date,
  ): Promise<Result<Delivered | "ready", AppError>> {
    const verdict = alert.verdict(now);
    if (verdict === "wait") return Result.ok("none");
    if (verdict === "missed") return this.giveUp(alert, lease);
    if (verdict === "skipped" || !context) return this.skip(alert, lease);

    const shown = await this.deadlines.forUser(alert.get("userId"), alert.get("eventId"));
    if (shown.isFailure) return Result.fail(shown.getError());
    const deadline = shown.getValue();
    if (deadline.isNone() || deadline.unwrap().done) return this.skip(alert, lease);
    if (!alert.ringsBefore(deadline.unwrap().deadlineAt)) return this.skip(alert, lease);

    return Result.ok("ready");
  }

  private async deliver(group: Deliverable[], now: Date): Promise<Settled[]> {
    const pushed = await this.pushAll(group);
    const each = (
      work: (deliverable: Deliverable) => Promise<Result<Delivered, AppError>>,
    ): Promise<Settled[]> =>
      mapBounded(group, DISPATCH_CONCURRENCY, async (deliverable) => ({
        alertId: deliverable.item.lease.alertId,
        delivered: await work(deliverable),
      }));

    if (pushed.isFailure) return each(async () => Result.fail(pushed.getError()));
    if (pushed.getValue())
      return each(({ item }) => this.markSent(item.alert, item.lease, "push", now));

    return each((deliverable) => this.sendEmail(deliverable, now));
  }

  private async sendEmail(
    { item: { alert, lease, failures }, context }: Deliverable,
    now: Date,
  ): Promise<Result<Delivered, AppError>> {
    const emailed = await this.email.send(context.email, {
      alertId: alert.id.value,
      version: alert.get("version"),
      eventTitle: context.eventTitle,
      childLabel: context.childLabel,
      deadlineLabel: context.deadlineLabel,
      eventUrl: context.eventUrl,
    });
    if (emailed.isSuccess) return this.markSent(alert, lease, "email", now);

    return this.emailFailed(alert, { lease, failures }, emailed.getError().code, now);
  }

  private async pushAll(group: Deliverable[]): Promise<Result<boolean, AppError>> {
    const [first] = group;
    if (!first) return Result.ok(false);

    const ports = {
      subscriptions: this.subscriptions,
      push: this.push,
      transactions: this.transactions,
      outbox: this.outbox,
    };
    const userId = first.item.alert.get("userId");
    const details = await this.subscriptions.lockScreenDetailsFor(userId);
    if (details.isFailure) return Result.fail(details.getError());
    const text = await this.copy.forAlerts(
      group.map(({ context }) => context),
      { details: details.getValue().unwrapOr(LOCK_SCREEN_DETAILS_BY_DEFAULT) },
    );
    const { url, tag, topic } = addressing(group);
    const fanout = await pushToParent(
      ports,
      userId,
      { ...text, url, tag },
      { ttlSeconds: PUSH_TTL_SECONDS, topic, urgency: "high" },
    );
    if (fanout.isFailure) return Result.fail(fanout.getError());

    const { delivered, failed } = fanout.getValue();
    for (const { item } of group)
      for (let failure = 0; failure < failed; failure += 1)
        await this.emitFailure(item.alert, "push", "PUSH_FAILED");
    return Result.ok(delivered);
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
    { lease, failures }: { lease: AlertLease; failures: number },
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
      const retry = emailRetryAfter(code, failures);
      if (retry === "wait") return Result.ok<Delivered, AppError>("none");
      if (retry === "retry") {
        const counted = await this.alerts.addFailure(lease);
        return counted.map((): Delivered => "none");
      }

      return this.settleMissed(alert, lease);
    });
  }

  private giveUp(alert: Alert, lease: AlertLease): Promise<Result<Delivered, AppError>> {
    return this.transactions.run(() => this.settleMissed(alert, lease));
  }

  private async settleMissed(
    alert: Alert,
    lease: AlertLease,
  ): Promise<Result<Delivered, AppError>> {
    alert.markMissed();
    const settled = await this.alerts.settle(alert, lease);
    if (settled.isFailure) return Result.fail(settled.getError());
    if (!settled.getValue()) return Result.ok("none");

    await emitEvent(this.outbox, EventTypes.ALERT_MISSED, "alert", alert.id.value, {
      userId: alert.get("userId"),
      alertId: alert.id.value,
      actorUserId: null,
    });
    return Result.ok("missed");
  }

  private skip(alert: Alert, lease: AlertLease): Promise<Result<Delivered, AppError>> {
    return this.transactions.run(async (): Promise<Result<Delivered, AppError>> => {
      alert.skip();
      const settled = await this.alerts.settle(alert, lease);
      if (settled.isFailure) return Result.fail(settled.getError());
      if (!settled.getValue()) return Result.ok("none");

      await emitEvent(this.outbox, EventTypes.ALERT_SKIPPED, "alert", alert.id.value, {
        userId: alert.get("userId"),
        alertId: alert.id.value,
        actorUserId: null,
      });
      return Result.ok("none");
    });
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
