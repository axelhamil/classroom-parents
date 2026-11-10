import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import { and, emailSchema, eq, lt } from "@packages/drizzle";
import { countEligibleWithTimeout } from "../shared/internal-routes/sweep-count";
import { beatOfSweep, withSweepHeartbeat } from "../shared/internal-routes/sweep-heartbeat";
import { sweepLockFor } from "../shared/internal-routes/sweep-lock";
import { purgeBatchWithTimeout, requireFilter } from "../shared/internal-routes/sweep-purge";
import {
  type RetentionPass,
  runRetentionSweep,
  type SweepResponse,
} from "../shared/internal-routes/sweep-runner";
import { type SweepSpans, sweepSpans } from "../shared/internal-routes/sweep-span";
import type { Logger } from "../shared/logger";
import { DrizzleSweepRunStore } from "../shared/services/drizzle-sweep-run.store";

export const EMAIL_RETENTION_LABEL = "sweep-email-messages";

const { emailMessage } = emailSchema;

function sentBefore(cutoff: Date) {
  return requireFilter(
    and(eq(emailMessage.status, "sent"), lt(emailMessage.sentAt, cutoff)),
    EMAIL_RETENTION_LABEL,
  );
}

function sentEmailPass(retentionDays: number, spans: SweepSpans, uow: IUnitOfWork): RetentionPass {
  return {
    label: "sent",
    retentionDays,
    purgeBatch: (cutoff, batchSize) =>
      purgeBatchWithTimeout({
        table: emailMessage,
        idColumn: emailMessage.id,
        where: sentBefore(cutoff),
        orderBy: emailMessage.sentAt,
        batchSize,
        spans,
        uow,
      }),
    countEligible: (cutoff) =>
      countEligibleWithTimeout(emailMessage, sentBefore(cutoff), spans, uow),
  };
}

export interface EmailRetentionDeps {
  uow: IUnitOfWork;
  instrumentation: IInstrumentation;
  logger: Logger;
  retentionDays: number;
  deadlineMs?: number;
}

export function sweepSentEmails(deps: EmailRetentionDeps): Promise<SweepResponse> {
  const spans = sweepSpans(deps.instrumentation);

  return withSweepHeartbeat(
    {
      label: EMAIL_RETENTION_LABEL,
      store: new DrizzleSweepRunStore(deps.instrumentation),
      spans,
      beatOf: beatOfSweep,
    },
    () =>
      runRetentionSweep({
        body: {},
        passes: [sentEmailPass(deps.retentionDays, spans, deps.uow)],
        logger: deps.logger,
        label: EMAIL_RETENTION_LABEL,
        deadlineMs: deps.deadlineMs,
        lock: sweepLockFor(EMAIL_RETENTION_LABEL, spans),
        spans,
      }),
  );
}
