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
import {
  DISPATCH_BATCH,
  DISPATCH_CONCURRENCY,
  DISPATCH_LEASE_SECONDS,
  emailRetryAfter,
} from "../config/dispatch-budget";
import type { IAlertEmailSender } from "../ports/alert-email-sender.port";
import type { DeliveryChannel } from "../ports/alert-repository.port";
import {
  DIGEST_ENABLED_BY_DEFAULT,
  type DigestDeadline,
  type IDigestAudience,
  type IDigestDeadlines,
} from "../ports/digest-audience.port";
import type { IPushSender } from "../ports/push-sender.port";
import type { IPushSubscriptionRepository } from "../ports/push-subscription-repository.port";
import type {
  ClaimedDigest,
  DigestSettlement,
  IWeeklyDigestRepository,
} from "../ports/weekly-digest-repository.port";
import { DIGEST_TITLE, digestSummary } from "./digest-message";
import { digestWeekDue, digestWeekOf } from "./digest-week";
import { pushToParent } from "./push-fanout";

export const DIGEST_PLAN_BATCH = 200;
export const DIGEST_PUSH_TTL_SECONDS = 6 * 3600;

export interface DigestOutcome {
  planned: number;
  claimed: number;
  sent: number;
  emailed: number;
  skipped: number;
  missed: number;
}

type Delivered = "push" | "email" | "skipped" | "missed" | "none";

type SkipReason = "opted_out" | "no_deadline";

function corrupted(digestId: string, error: string): AppError {
  return { code: "ALERT_PROVIDER_FAILURE", message: `digest ${digestId}: ${error}` };
}

export class WeeklyDigestService {
  constructor(
    private readonly digests: IWeeklyDigestRepository,
    private readonly audience: IDigestAudience,
    private readonly deadlines: IDigestDeadlines,
    private readonly subscriptions: IPushSubscriptionRepository,
    private readonly push: IPushSender,
    private readonly email: IAlertEmailSender,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly appOrigin: string,
  ) {}

  async runOnce(now: Date): Promise<Result<DigestOutcome, AppError>> {
    return this.instrumentation.startSpan(
      { name: "WeeklyDigestService > runOnce", op: "function" },
      async () => {
        const planned = await this.plan(now);
        if (planned.isFailure) return Result.fail(planned.getError());

        const claimed = await this.digests.claimDue(DISPATCH_BATCH, DISPATCH_LEASE_SECONDS);
        if (claimed.isFailure) return Result.fail(claimed.getError());

        const batch = claimed.getValue();
        const outcome: DigestOutcome = {
          planned: planned.getValue(),
          claimed: batch.length,
          sent: 0,
          emailed: 0,
          skipped: 0,
          missed: 0,
        };
        const outcomes = await mapBounded(batch, DISPATCH_CONCURRENCY, async (digest) => ({
          digestId: digest.lease.digestId,
          delivered: await this.dispatch(digest, now),
        }));
        for (const { digestId, delivered } of outcomes) {
          if (delivered.isFailure) {
            this.instrumentation.capture(
              new Error(`digest ${digestId}: ${delivered.getError().code}`),
            );
            continue;
          }
          if (delivered.getValue() === "push") outcome.sent += 1;
          if (delivered.getValue() === "email") outcome.emailed += 1;
          if (delivered.getValue() === "skipped") outcome.skipped += 1;
          if (delivered.getValue() === "missed") outcome.missed += 1;
        }
        return Result.ok(outcome);
      },
    );
  }

  private async plan(now: Date): Promise<Result<number, AppError>> {
    const due = digestWeekDue(now);
    if (due.isNone()) return Result.ok(0);

    const week = due.unwrap();
    const awaiting = await this.audience.awaiting(week, DIGEST_PLAN_BATCH);
    if (awaiting.isFailure) return Result.fail(awaiting.getError());
    if (awaiting.getValue().length === 0) return Result.ok(0);

    return this.digests.plan(awaiting.getValue(), week.weekStart, week.from);
  }

  private async dispatch(digest: ClaimedDigest, now: Date): Promise<Result<Delivered, AppError>> {
    if (now.getTime() >= digest.expiresAt.getTime()) return this.giveUp(digest);

    const enabled = await this.digests.enabledFor(digest.userId);
    if (enabled.isFailure) return Result.fail(enabled.getError());
    if (!enabled.getValue().unwrapOr(DIGEST_ENABLED_BY_DEFAULT))
      return this.skip(digest, "opted_out");

    const week = digestWeekOf(digest.weekStart);
    if (week.isFailure) return Result.fail(corrupted(digest.lease.digestId, week.getError()));

    const { from, to } = week.getValue();
    const deadlines = await this.deadlines.within(digest.userId, from, to);
    if (deadlines.isFailure) return Result.fail(deadlines.getError());
    if (deadlines.getValue().length === 0) return this.skip(digest, "no_deadline");

    return this.deliver(digest, deadlines.getValue(), now);
  }

  private async deliver(
    digest: ClaimedDigest,
    deadlines: DigestDeadline[],
    now: Date,
  ): Promise<Result<Delivered, AppError>> {
    const summary = digestSummary(deadlines);
    const appUrl = new URL("/", this.appOrigin).toString();
    const ports = {
      subscriptions: this.subscriptions,
      push: this.push,
      transactions: this.transactions,
      outbox: this.outbox,
    };
    const pushed = await pushToParent(
      ports,
      digest.userId,
      { title: DIGEST_TITLE, body: summary, url: appUrl, tag: `week-${digest.weekStart}` },
      {
        ttlSeconds: DIGEST_PUSH_TTL_SECONDS,
        topic: digest.lease.digestId.replaceAll("-", ""),
        urgency: "normal",
      },
    );
    if (pushed.isFailure) return Result.fail(pushed.getError());
    if (pushed.getValue().delivered) return this.markSent(digest, "push", deadlines.length, now);

    const recipient = await this.audience.emailOf(digest.userId);
    if (recipient.isFailure) return Result.fail(recipient.getError());
    if (recipient.getValue().isNone()) return this.giveUp(digest);

    const emailed = await this.email.sendDigest(recipient.getValue().unwrap(), {
      digestId: digest.lease.digestId,
      summary,
      appUrl,
    });
    if (emailed.isSuccess) return this.markSent(digest, "email", deadlines.length, now);

    return this.emailFailed(digest, emailed.getError().code);
  }

  private markSent(
    digest: ClaimedDigest,
    channel: DeliveryChannel,
    deadlines: number,
    now: Date,
  ): Promise<Result<Delivered, AppError>> {
    return this.settle(digest, { status: "sent", channel, at: now }, channel, () =>
      emitEvent(
        this.outbox,
        EventTypes.WEEKLY_DIGEST_SENT,
        "weekly_digest",
        digest.lease.digestId,
        {
          ...this.ref(digest),
          channel,
          deadlines,
          actorUserId: null,
        },
      ),
    );
  }

  private emailFailed(digest: ClaimedDigest, code: string): Promise<Result<Delivered, AppError>> {
    const retry = emailRetryAfter(code, digest.failures);
    if (retry === "wait") return Promise.resolve(Result.ok("none"));
    if (retry === "give_up") return this.giveUp(digest);

    return this.digests
      .addFailure(digest.lease)
      .then((counted) => counted.map((): Delivered => "none"));
  }

  private giveUp(digest: ClaimedDigest): Promise<Result<Delivered, AppError>> {
    return this.settle(digest, { status: "missed" }, "missed", () =>
      emitEvent(
        this.outbox,
        EventTypes.WEEKLY_DIGEST_MISSED,
        "weekly_digest",
        digest.lease.digestId,
        { ...this.ref(digest), actorUserId: null },
      ),
    );
  }

  private skip(digest: ClaimedDigest, reason: SkipReason): Promise<Result<Delivered, AppError>> {
    return this.settle(digest, { status: "skipped" }, "skipped", () =>
      emitEvent(
        this.outbox,
        EventTypes.WEEKLY_DIGEST_SKIPPED,
        "weekly_digest",
        digest.lease.digestId,
        { ...this.ref(digest), reason, actorUserId: null },
      ),
    );
  }

  private settle(
    digest: ClaimedDigest,
    settlement: DigestSettlement,
    outcome: Delivered,
    announce: () => Promise<unknown>,
  ): Promise<Result<Delivered, AppError>> {
    return this.transactions.run(async (): Promise<Result<Delivered, AppError>> => {
      const settled = await this.digests.settle(digest.lease, settlement);
      if (settled.isFailure) return Result.fail(settled.getError());
      if (!settled.getValue()) return Result.ok("none");

      await announce();
      return Result.ok(outcome);
    });
  }

  private ref(digest: ClaimedDigest) {
    return { userId: digest.userId, digestId: digest.lease.digestId, weekStart: digest.weekStart };
  }
}
