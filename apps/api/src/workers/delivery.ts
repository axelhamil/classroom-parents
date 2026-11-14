import type { IInstrumentation, ILogger } from "@packages/ddd-kit";
import type { EmailDeliveryWorker } from "@packages/email/email-delivery-worker";
import type { OutboxRelay } from "@packages/outbox/outbox-relay";
import { failed, type JobOutcome, succeeded } from "./job";

type Relay = Pick<OutboxRelay, "drainOnce">;
type EmailWorker = Pick<EmailDeliveryWorker, "drainOnce">;

export async function drainOutbox(relay: Relay, signal: AbortSignal): Promise<JobOutcome> {
  const counts = { dispatched: 0, failed: 0, died: 0, rounds: 0 };

  while (!signal.aborted) {
    const outcome = await relay.drainOnce();
    counts.dispatched += outcome.dispatched;
    counts.failed += outcome.failed;
    counts.died += outcome.died;
    counts.rounds += 1;
    if (outcome.dispatched + outcome.failed === 0) break;
  }

  return succeeded(counts);
}

export async function drainEmails(worker: EmailWorker, signal: AbortSignal): Promise<JobOutcome> {
  const counts = { claimed: 0, rounds: 0 };

  while (!signal.aborted) {
    const drained = await worker.drainOnce();
    if (drained.isFailure) return failed(drained.getError().code, counts, drained.getError());

    counts.claimed += drained.getValue().claimed;
    counts.rounds += 1;
    if (!drained.getValue().saturated) break;
  }

  return succeeded(counts);
}

export interface DeliveryDrainDeps {
  relay: () => Relay;
  emails: EmailWorker;
  instrumentation: IInstrumentation;
  logger: ILogger;
  budgetMs: number;
}

export class DeliveryDrain {
  private running: Promise<void> | undefined;
  private again = false;

  constructor(private readonly deps: DeliveryDrainDeps) {}

  outbox(signal: AbortSignal): Promise<JobOutcome> {
    return drainOutbox(this.deps.relay(), signal);
  }

  emails(signal: AbortSignal): Promise<JobOutcome> {
    return drainEmails(this.deps.emails, signal);
  }

  drain(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }

    const running = this.untilQuiet(AbortSignal.timeout(this.deps.budgetMs)).finally(() => {
      this.running = undefined;
    });
    this.running = running;
    return running;
  }

  private async untilQuiet(signal: AbortSignal): Promise<void> {
    do {
      this.again = false;
      await this.report("outbox", () => this.outbox(signal));
      await this.report("emails", () => this.emails(signal));
    } while (this.again && !signal.aborted);
  }

  private async report(job: string, run: () => Promise<JobOutcome>): Promise<void> {
    const outcome = await run().catch(
      (err: unknown): JobOutcome => failed("DELIVERY_DRAIN_CRASHED", {}, err),
    );
    if (outcome.ok) return;

    this.deps.logger.warn({ job, code: outcome.code, err: outcome.cause }, "delivery drain failed");
    this.deps.instrumentation.capture(outcome.cause ?? new Error(`${job} drain failed`), {
      metadata: { job, code: outcome.code },
    });
  }
}
