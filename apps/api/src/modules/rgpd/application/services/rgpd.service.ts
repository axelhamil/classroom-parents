import { type IInstrumentation, type ILogger, type IUnitOfWork, Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { RgpdSettings } from "../config/rgpd-settings";
import type { IChildConnections } from "../ports/child-connections.port";
import type {
  ExecuteWipeOutput,
  IRgpdRepository,
  RgpdError,
  UserDeletionState,
} from "../ports/rgpd.port";

export interface RequestAccountDeletionInput {
  userId: string;
  sessionId: string;
}
export interface RequestAccountDeletionOutput {
  pendingDeletionUntil: string;
}

export interface CancelAccountDeletionInput {
  userId: string;
}
export interface CancelAccountDeletionOutput {
  ok: true;
}

export interface ExecuteAccountWipeInput {
  userId: string;
  now: Date;
}
export interface ExecuteAccountWipeOutput {
  alreadyWiped: boolean;
}

export interface ProcessPendingDeletionsInput {
  now: Date;
  batchSize?: number;
  dryRun?: boolean;
  deadlineMs?: number;
}
export interface ProcessPendingDeletionsOutput {
  processed: number;
  succeeded: string[];
  failed: Array<{ userId: string; errorCode: string }>;
  dryRun: boolean;
  truncated: boolean;
}

const DELETION_ALREADY_RUNNING: RgpdError = {
  code: "ACCOUNT_DELETION_CANCEL_CONFLICT",
  message:
    "Le délai d'annulation est passé : la suppression de votre compte est en cours et ne peut plus être annulée.",
};

export class RgpdService {
  constructor(
    private readonly rgpd: IRgpdRepository,
    private readonly childConnections: IChildConnections,
    private readonly email: IEmailService,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly settings: Omit<RgpdSettings, "sweepBatchSize">,
    private readonly logger: ILogger,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async requestAccountDeletion(
    input: RequestAccountDeletionInput,
  ): Promise<Result<RequestAccountDeletionOutput, RgpdError>> {
    return this.instrumentation.startSpan(
      { name: "RgpdService > requestAccountDeletion", op: "function" },
      async () => {
        const stateResult = await this.loadDeletionState(input.userId);
        if (stateResult.isFailure) return Result.fail(stateResult.getError());

        const state = stateResult.getValue();

        if (state.pendingDeletionUntil.isSome())
          return Result.ok({
            pendingDeletionUntil: state.pendingDeletionUntil.unwrap().toISOString(),
          });

        const freshness = await this.ensureFreshSession(input);
        if (freshness.isFailure) return Result.fail(freshness.getError());

        const until = new Date(
          this.clock().getTime() + this.settings.gracePeriodDays * 24 * 60 * 60 * 1000,
        );
        const txResult = await this.transactions.run(async () => {
          const marked = await this.rgpd.markPendingDeletion(input.userId, until);
          if (marked.isFailure || !marked.getValue()) return marked;
          await emitEvent(
            this.outbox,
            EventTypes.USER_DELETION_REQUESTED,
            "user",
            input.userId,
            { userId: input.userId, pendingDeletionUntil: until },
            {},
          );
          return marked;
        });
        if (txResult.isFailure) return Result.fail(txResult.getError());
        if (!txResult.getValue()) return this.currentPendingDeletion(input.userId);

        const cancelUrl = `${this.settings.appUrl}/settings/account`;
        const sent = await this.email.sendTemplate(
          "delete_requested",
          state.email,
          { name: state.name, cancelUrl, expiresAt: until.toISOString() },
          {
            idempotencyKey: `delete-requested/${input.userId}/${until.getTime()}`,
          },
        );
        if (sent.isFailure)
          this.logger.warn(
            { userId: input.userId, code: sent.getError().code },
            "deletion marked but notification email failed",
          );

        return Result.ok({ pendingDeletionUntil: until.toISOString() });
      },
    );
  }

  async cancelAccountDeletion(
    input: CancelAccountDeletionInput,
  ): Promise<Result<CancelAccountDeletionOutput, RgpdError>> {
    return this.instrumentation.startSpan(
      { name: "RgpdService > cancelAccountDeletion", op: "function" },
      async () => {
        const stateResult = await this.loadDeletionState(input.userId);
        if (stateResult.isFailure) return Result.fail(stateResult.getError());

        const state = stateResult.getValue();
        if (state.pendingDeletionUntil.isNone())
          return Result.fail({
            code: "ACCOUNT_DELETION_NOT_FOUND",
            message: "no pending deletion to cancel",
          });
        const pendingUntil = state.pendingDeletionUntil.unwrap();
        const now = this.clock();
        if (pendingUntil <= now) return Result.fail(DELETION_ALREADY_RUNNING);

        const txResult = await this.transactions.run(async () => {
          const cleared = await this.rgpd.clearPendingDeletion(input.userId, now);
          if (cleared.isFailure) return Result.fail<void, RgpdError>(cleared.getError());
          if (!cleared.getValue()) return Result.fail<void, RgpdError>(DELETION_ALREADY_RUNNING);
          await emitEvent(
            this.outbox,
            EventTypes.USER_DELETION_CANCELLED,
            "user",
            input.userId,
            { userId: input.userId },
            {},
          );
          return Result.ok<RgpdError>();
        });
        if (txResult.isFailure) return Result.fail(txResult.getError());

        const sent = await this.email.sendTemplate(
          "delete_cancelled",
          state.email,
          { name: state.name },
          {
            idempotencyKey: `delete-cancelled/${input.userId}/${pendingUntil.getTime()}`,
          },
        );
        if (sent.isFailure)
          this.logger.warn(
            { userId: input.userId, code: sent.getError().code },
            "deletion cleared but notification email failed",
          );

        return Result.ok({ ok: true });
      },
    );
  }

  async executeAccountWipe(
    input: ExecuteAccountWipeInput,
  ): Promise<Result<ExecuteAccountWipeOutput, RgpdError>> {
    return this.instrumentation.startSpan(
      { name: "RgpdService > executeAccountWipe", op: "function" },
      async () => {
        const stateResult = await this.loadDeletionState(input.userId);
        if (stateResult.isFailure) return Result.fail(stateResult.getError());

        const state = stateResult.getValue();
        if (state.pendingDeletionUntil.isNone() || state.pendingDeletionUntil.unwrap() > input.now)
          return Result.fail({
            code: "ACCOUNT_DELETION_NOT_FOUND",
            message: "user is not in pending_deletion state or grace has not elapsed",
          });

        await this.revokeChildTokens(input.userId);

        const originalEmail = state.email;
        const originalName = state.name;

        let inner: Result<ExecuteWipeOutput, RgpdError>;
        try {
          inner = await this.transactions.run(async () => {
            const wipe = await this.rgpd.executeWipe(input.userId, originalEmail, input.now);
            if (wipe.isFailure) return wipe;
            if (wipe.getValue().alreadyWiped) return wipe;

            await emitEvent(
              this.outbox,
              EventTypes.USER_DELETED,
              "user",
              input.userId,
              { userId: input.userId, deletedAt: input.now },
              {},
            );
            const notified = await this.email.sendTemplate(
              "delete_completed",
              originalEmail,
              { name: originalName },
              {
                idempotencyKey: `delete-completed/${input.userId}`,
              },
            );
            if (notified.isFailure) {
              this.logger.error(
                { userId: input.userId, code: notified.getError().code },
                "account wipe rolled back: deletion confirmation could not be enqueued",
              );
              return Result.fail<ExecuteWipeOutput, RgpdError>({
                code: "ACCOUNT_WIPE_NOTIFY_PROVIDER_FAILURE",
                message: "deletion confirmation enqueue failed, wipe rolled back",
              });
            }
            return wipe;
          });
        } catch (e) {
          this.instrumentation.capture(e);
          this.logger.error({ err: e, userId: input.userId }, "account wipe transaction failed");
          return Result.fail({
            code: "ACCOUNT_WIPE_PROVIDER_FAILURE",
            message: "wipe transaction failed",
          });
        }

        if (inner.isFailure) {
          const failure = inner.getError();
          if (failure.code === "ACCOUNT_WIPE_NOTIFY_PROVIDER_FAILURE") return Result.fail(failure);

          this.logger.error(
            { userId: input.userId, code: failure.code },
            "account wipe transaction reported failure",
          );
          return Result.fail({
            code: "ACCOUNT_WIPE_PROVIDER_FAILURE",
            message: "wipe transaction failed",
          });
        }
        return Result.ok({ alreadyWiped: inner.getValue().alreadyWiped });
      },
    );
  }

  async processPendingDeletions(
    input: ProcessPendingDeletionsInput,
  ): Promise<Result<ProcessPendingDeletionsOutput, RgpdError>> {
    return this.instrumentation.startSpan(
      { name: "RgpdService > processPendingDeletions", op: "function" },
      async () => {
        const dryRun = input.dryRun === true;

        const batchResult = await this.rgpd.findUsersReadyForWipe(input.now, input.batchSize ?? 50);
        if (batchResult.isFailure) {
          this.logger.error(
            { code: batchResult.getError().code },
            "rgpd sweep aborted: could not load batch",
          );
          return Result.fail(batchResult.getError());
        }

        const batch = batchResult.getValue().filter((row) => row.pendingDeletionUntil <= input.now);

        if (dryRun)
          return Result.ok({
            processed: batch.length,
            succeeded: batch.map((r) => r.userId),
            failed: [],
            dryRun: true,
            truncated: false,
          });

        const deadlineAt =
          this.clock().getTime() + (input.deadlineMs ?? this.settings.sweepDeadlineMs);

        const succeeded: string[] = [];
        const failed: Array<{ userId: string; errorCode: string }> = [];
        let truncated = false;

        for (const row of batch) {
          // Checked between wipes, never inside one: executeAccountWipe owns a transaction
          // with cascade deletes, and cutting it short would leave a
          // half-erased account, the one outcome an Art. 17 sweep must never produce.
          if (this.clock().getTime() >= deadlineAt) {
            truncated = true;
            this.logger.warn(
              {
                processed: succeeded.length + failed.length,
                remaining: batch.length - succeeded.length - failed.length,
              },
              "rgpd sweep hit the time budget: remaining accounts deferred to the next tick",
            );
            break;
          }

          try {
            const res = await this.executeAccountWipe({ userId: row.userId, now: input.now });
            if (res.isSuccess) {
              succeeded.push(row.userId);
            } else {
              failed.push({ userId: row.userId, errorCode: res.getError().code });
            }
          } catch (e) {
            const message = e instanceof Error ? e.message : "unknown";
            failed.push({ userId: row.userId, errorCode: "WIPE_UNCAUGHT" });
            this.logger.error(
              { err: e, userId: row.userId, message },
              "wipe threw uncaught error: Result contract violated",
            );
          }
        }

        if (succeeded.length > 0)
          this.logger.info(
            { processed: batch.length, succeeded: succeeded.length, failed: failed.length },
            "rgpd sweep completed",
          );

        if (failed.length > 0) this.logger.warn({ failed }, "rgpd sweep had failures");

        return Result.ok({
          processed: succeeded.length + failed.length,
          succeeded,
          failed,
          dryRun: false,
          truncated,
        });
      },
    );
  }

  private async currentPendingDeletion(
    userId: string,
  ): Promise<Result<RequestAccountDeletionOutput, RgpdError>> {
    const stateResult = await this.loadDeletionState(userId);
    if (stateResult.isFailure) return Result.fail(stateResult.getError());

    const pending = stateResult.getValue().pendingDeletionUntil;
    if (pending.isNone())
      return Result.fail({ code: "ACCOUNT_DELETION_NOT_FOUND", message: "no pending deletion" });

    return Result.ok({ pendingDeletionUntil: pending.unwrap().toISOString() });
  }

  private async ensureFreshSession(
    input: RequestAccountDeletionInput,
  ): Promise<Result<void, RgpdError>> {
    const startResult = await this.rgpd.findSessionStart(input.userId, input.sessionId);
    if (startResult.isFailure) return Result.fail(startResult.getError());

    const start = startResult.getValue();
    const fresh =
      start.isSome() &&
      this.clock().getTime() - start.unwrap().getTime() < this.settings.freshSessionMaxAgeMs;
    if (fresh) return Result.ok();

    return Result.fail({
      code: "ACCOUNT_REAUTH_REQUIRED",
      message: "Reconnectez-vous avec Google, puis relancez la suppression de votre compte.",
    });
  }

  private async revokeChildTokens(userId: string): Promise<void> {
    const revocation = await this.childConnections.revokeAll(userId);
    if (revocation.isFailure) {
      this.logger.warn(
        { userId, code: revocation.getError().code },
        "child token revocation failed, the wipe goes on (right to erasure)",
      );
      return;
    }

    const tally = revocation.getValue();
    if (tally.failed > 0)
      this.logger.warn({ userId, ...tally }, "google refused some child token revocations");
  }

  private async loadDeletionState(userId: string): Promise<Result<UserDeletionState, RgpdError>> {
    const stateResult = await this.rgpd.getUserDeletionState(userId);
    if (stateResult.isFailure) return Result.fail(stateResult.getError());

    const state = stateResult.getValue();
    if (state.isNone()) {
      return Result.fail({ code: "ACCOUNT_DELETION_NOT_FOUND", message: "user not found" });
    }

    return Result.ok(state.unwrap());
  }
}
