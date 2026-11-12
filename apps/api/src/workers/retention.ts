import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import { dismissedEventBefore, pastEventBefore } from "@modules/agenda/schemas/event-retention";
import { firstSyncedDay } from "@modules/classroom-sync/application/sync-lookback";
import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import { shiftDate, shiftInstant } from "@packages/ddd-kit/days";
import {
  type AnyPgColumn,
  type AnyPgTable,
  and,
  emailSchema,
  eq,
  inArray,
  isNotNull,
  lt,
  outboxSchema,
  type SQL,
} from "@packages/drizzle";
import { EventTypes, type PayloadByEventType } from "@packages/events";
import { type BatchedEvent, emitEvents } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { z } from "zod";
import { countEligibleWithTimeout } from "../shared/internal-routes/sweep-count";
import { beatOfSweep, withSweepHeartbeat } from "../shared/internal-routes/sweep-heartbeat";
import { sweepLockFor } from "../shared/internal-routes/sweep-lock";
import {
  lockedBatch,
  purgeBatchWithTimeout,
  requireFilter,
  withSweepGuards,
} from "../shared/internal-routes/sweep-purge";
import {
  type RetentionPass,
  runRetentionSweep,
  type SweepResponse,
} from "../shared/internal-routes/sweep-runner";
import { type SweepSpans, sweepSpans } from "../shared/internal-routes/sweep-span";
import type { Logger } from "../shared/logger";
import type { ISweepRunStore } from "../shared/ports/sweep-run.port";

export const EMAIL_RETENTION_LABEL = "sweep-email-messages";
export const OUTBOX_RETENTION_LABEL = "sweep-outbox-events";
export const OUTBOX_RETENTION_DAYS = 7;
export const EVENT_HISTORY_LABEL = "sweep-event-history";
export const PAST_EVENT_RETENTION_DAYS = 365;
export const DISMISSED_EVENT_RETENTION_DAYS = 30;

const { emailMessage } = emailSchema;
const { outboxEvent } = outboxSchema;

interface PassTarget {
  label: string;
  sweep: string;
  table: AnyPgTable;
  idColumn: AnyPgColumn;
  orderBy: AnyPgColumn;
  before: (cutoff: Date) => SQL | undefined;
}

function retentionPass(
  target: PassTarget,
  retentionDays: number,
  spans: SweepSpans,
  uow: IUnitOfWork,
): RetentionPass {
  const where = (cutoff: Date) => requireFilter(target.before(cutoff), target.sweep);

  return {
    label: target.label,
    retentionDays,
    purgeBatch: (cutoff, batchSize) =>
      purgeBatchWithTimeout({
        table: target.table,
        idColumn: target.idColumn,
        where: where(cutoff),
        orderBy: target.orderBy,
        batchSize,
        spans,
        uow,
      }),
    countEligible: (cutoff) => countEligibleWithTimeout(target.table, where(cutoff), spans, uow),
  };
}

const sentEmails: PassTarget = {
  label: "sent",
  sweep: EMAIL_RETENTION_LABEL,
  table: emailMessage,
  idColumn: emailMessage.id,
  orderBy: emailMessage.sentAt,
  before: (cutoff) => and(eq(emailMessage.status, "sent"), lt(emailMessage.sentAt, cutoff)),
};

const undeliveredEmails: PassTarget = {
  label: "undelivered",
  sweep: EMAIL_RETENTION_LABEL,
  table: emailMessage,
  idColumn: emailMessage.id,
  orderBy: emailMessage.createdAt,
  before: (cutoff) =>
    and(inArray(emailMessage.status, ["failed", "dead"]), lt(emailMessage.createdAt, cutoff)),
};

const erasableDeadEmails: PassTarget = {
  label: "erasable-dead",
  sweep: EMAIL_RETENTION_LABEL,
  table: emailMessage,
  idColumn: emailMessage.id,
  orderBy: emailMessage.createdAt,
  before: (cutoff) =>
    and(
      eq(emailMessage.eraseOnSettle, true),
      eq(emailMessage.status, "dead"),
      lt(emailMessage.createdAt, cutoff),
    ),
};

const deliveredEvents: PassTarget = {
  label: "delivered",
  sweep: OUTBOX_RETENTION_LABEL,
  table: outboxEvent,
  idColumn: outboxEvent.id,
  orderBy: outboxEvent.dispatchedAt,
  before: (cutoff) =>
    and(isNotNull(outboxEvent.dispatchedAt), lt(outboxEvent.dispatchedAt, cutoff)),
};

type EventsPurgedPayload = z.infer<(typeof PayloadByEventType)[typeof EventTypes.EVENTS_PURGED]>;
type PurgeScope = EventsPurgedPayload["scope"];

interface EventHistoryTarget {
  scope: PurgeScope;
  before: (cutoff: Date) => SQL | undefined;
}

const pastEvents: EventHistoryTarget = { scope: "past", before: pastEventBefore };

const dismissedEvents: EventHistoryTarget = {
  scope: "dismissed",
  before: (cutoff) =>
    dismissedEventBefore({
      dismissedBefore: cutoff,
      courseworkDayBefore: shiftDate(
        firstSyncedDay(shiftInstant(cutoff, DISMISSED_EVENT_RETENTION_DAYS)),
        -1,
      ),
    }),
};

function purgedPerParent(
  deleted: { userId: string }[],
  scope: PurgeScope,
): BatchedEvent<EventsPurgedPayload>[] {
  const counts = new Map<string, number>();
  for (const { userId } of deleted) counts.set(userId, (counts.get(userId) ?? 0) + 1);

  return [...counts].map(
    ([userId, count]): BatchedEvent<EventsPurgedPayload> => ({
      eventType: EventTypes.EVENTS_PURGED,
      aggregateId: userId,
      payload: { userId, count, reason: "retention", scope, actorUserId: null },
    }),
  );
}

function eventHistoryPass(
  target: EventHistoryTarget,
  retentionDays: number,
  spans: SweepSpans,
  deps: EventHistoryDeps,
): RetentionPass {
  const where = (cutoff: Date) => requireFilter(target.before(cutoff), EVENT_HISTORY_LABEL);

  return {
    label: target.scope,
    retentionDays,
    purgeBatch: (cutoff, batchSize) =>
      withSweepGuards(deps.uow, async (exec) => {
        const batch = lockedBatch(exec, {
          table: agendaEvent,
          idColumn: agendaEvent.id,
          where: where(cutoff),
          orderBy: agendaEvent.deadlineAt,
          batchSize,
        });
        const query = exec
          .delete(agendaEvent)
          .where(inArray(agendaEvent.id, batch))
          .returning({ userId: agendaEvent.userId });
        const deleted = await spans.db(
          () => query.toSQL().sql,
          () => query.execute(),
        );

        await emitEvents(deps.outbox, "user", purgedPerParent(deleted, target.scope));
        return deleted.length;
      }),
    countEligible: (cutoff) =>
      countEligibleWithTimeout(agendaEvent, where(cutoff), spans, deps.uow),
  };
}

export interface RetentionDeps {
  uow: IUnitOfWork;
  instrumentation: IInstrumentation;
  sweepRuns: ISweepRunStore;
  logger: Logger;
  deadlineMs?: number;
}

export interface EventHistoryDeps extends RetentionDeps {
  outbox: IOutboxRepository;
}

export interface EmailRetentionDeps extends RetentionDeps {
  retentionDays: number;
  deadReplayWindowHours: number;
}

function sweep(
  label: string,
  deps: RetentionDeps,
  passes: (spans: SweepSpans) => RetentionPass[],
): Promise<SweepResponse> {
  const spans = sweepSpans(deps.instrumentation);

  return withSweepHeartbeat({ label, store: deps.sweepRuns, spans, beatOf: beatOfSweep }, () =>
    runRetentionSweep({
      body: {},
      passes: passes(spans),
      logger: deps.logger,
      label,
      deadlineMs: deps.deadlineMs,
      lock: sweepLockFor(label, spans),
      spans,
    }),
  );
}

export function sweepOldEmails(deps: EmailRetentionDeps): Promise<SweepResponse> {
  return sweep(EMAIL_RETENTION_LABEL, deps, (spans) => [
    retentionPass(sentEmails, deps.retentionDays, spans, deps.uow),
    retentionPass(undeliveredEmails, deps.retentionDays, spans, deps.uow),
    retentionPass(erasableDeadEmails, deps.deadReplayWindowHours / 24, spans, deps.uow),
  ]);
}

export function sweepDeliveredOutbox(deps: RetentionDeps): Promise<SweepResponse> {
  return sweep(OUTBOX_RETENTION_LABEL, deps, (spans) => [
    retentionPass(deliveredEvents, OUTBOX_RETENTION_DAYS, spans, deps.uow),
  ]);
}

export function sweepEventHistory(deps: EventHistoryDeps): Promise<SweepResponse> {
  return sweep(EVENT_HISTORY_LABEL, deps, (spans) => [
    eventHistoryPass(pastEvents, PAST_EVENT_RETENTION_DAYS, spans, deps),
    eventHistoryPass(dismissedEvents, DISMISSED_EVENT_RETENTION_DAYS, spans, deps),
  ]);
}
