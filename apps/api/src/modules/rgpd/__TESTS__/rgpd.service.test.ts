import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  type IInstrumentation,
  type ILogger,
  type IUnitOfWork,
  Option,
  Result,
  UnitOfWorkContext,
} from "@packages/ddd-kit";
import type { EmailError, IEmailService } from "@packages/email/email.port";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type {
  ExecuteWipeOutput,
  IRgpdRepository,
  PendingDeletionRow,
  RgpdError,
  UserDeletionState,
} from "../application/ports/rgpd.port";
import { RgpdService } from "../application/services/rgpd.service";

const baseState: UserDeletionState = {
  email: "u@example.com",
  name: "User",
  pendingDeletionUntil: Option.none(),
  deletedAt: Option.none(),
};

let uow: UnitOfWorkMock = mockUnitOfWork();

function throwingUnitOfWork(message: string): IUnitOfWork {
  const { unitOfWork } = mockUnitOfWork();
  unitOfWork.run.mockImplementation(async () => {
    throw new Error(message);
  });
  return unitOfWork;
}

function graceElapsedStateFor(userId: string): UserDeletionState {
  return {
    ...baseState,
    email: `${userId}@example.com`,
    pendingDeletionUntil: Option.some(new Date(Date.now() - 1000)),
  };
}

function makeRepo(overrides: Partial<IRgpdRepository> = {}): IRgpdRepository {
  return {
    markPendingDeletion: mock(async () => Result.ok<RgpdError>()),
    clearPendingDeletion: mock(async () => Result.ok<RgpdError>()),
    findUsersReadyForWipe: mock(async () => Result.ok<PendingDeletionRow[], RgpdError>([])),
    executeWipe: mock(async () => Result.ok<ExecuteWipeOutput, RgpdError>({ alreadyWiped: false })),
    verifyPassword: mock(async () => Result.ok<boolean, RgpdError>(true)),
    getUserDeletionState: mock(async () =>
      Result.ok<Option<UserDeletionState>, RgpdError>(Option.some(baseState)),
    ),
    ...overrides,
  } as unknown as IRgpdRepository;
}

function makeEmail(): IEmailService {
  return {
    sendTemplate: mock(async () => Result.ok<RgpdError>()),
    sendTemplateBatch: mock(async () => Result.ok<RgpdError>()),
    sendRaw: mock(async () => Result.ok<RgpdError>()),
    sendRawBatch: mock(async () => Result.ok<RgpdError>()),
  } as unknown as IEmailService;
}

function buildService(deps: {
  repo: IRgpdRepository;
  email: IEmailService;
  uow?: IUnitOfWork;
  outbox?: IOutboxRepository;
  instrumentation?: IInstrumentation;
}): RgpdService {
  const outbox = deps.outbox ?? mockPort<IOutboxRepository>();

  return new RgpdService(
    deps.repo,
    deps.email,
    deps.uow ?? uow.unitOfWork,
    outbox,
    deps.instrumentation ?? new NoOpInstrumentation(),
    {
      appUrl: "https://app.example.com",
      gracePeriodDays: 7,
      sweepDeadlineMs: 90_000,
    },
    mockPort<ILogger>(),
  );
}

function makeService(opts: {
  email?: IEmailService;
  readyForWipe?: string[];
  wipeFails?: boolean;
}): RgpdService {
  const rows: PendingDeletionRow[] = (opts.readyForWipe ?? []).map((userId) => ({
    userId,
    email: `${userId}@example.com`,
    pendingDeletionUntil: new Date(Date.now() - 1000),
  }));
  const repo = makeRepo({
    findUsersReadyForWipe: mock(async () => Result.ok<PendingDeletionRow[], RgpdError>(rows)),
    getUserDeletionState: opts.wipeFails
      ? mock(async () => Result.ok<Option<UserDeletionState>, RgpdError>(Option.none()))
      : mock(async (userId: string) =>
          Result.ok<Option<UserDeletionState>, RgpdError>(
            Option.some(graceElapsedStateFor(userId)),
          ),
        ),
  });
  return buildService({ repo, email: opts.email ?? makeEmail() });
}

describe("RgpdService", () => {
  let email: IEmailService;

  beforeEach(() => {
    email = makeEmail();
    uow = mockUnitOfWork();
  });

  describe("requestAccountDeletion", () => {
    it("returns ACCOUNT_PASSWORD_INVALID on bad password", async () => {
      const repo = makeRepo({
        verifyPassword: mock(async () => Result.ok<boolean, RgpdError>(false)),
      });
      const service = buildService({ repo, email });

      const result = await service.requestAccountDeletion({ userId: "u1", password: "wrong" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_PASSWORD_INVALID");
    });

    it("marks pending and emails when the password is valid", async () => {
      const repo = makeRepo();
      const service = buildService({ repo, email });

      const result = await service.requestAccountDeletion({ userId: "u1", password: "good" });

      expect(result.isSuccess).toBe(true);
      expect(repo.markPendingDeletion).toHaveBeenCalled();
      expect(email.sendTemplate).toHaveBeenCalledWith(
        "delete_requested",
        "u@example.com",
        expect.objectContaining({ name: "User", cancelUrl: expect.any(String) }),
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
    });

    it("returns existing pendingDeletionUntil when already pending without re-marking", async () => {
      const existing = new Date(Date.now() + 86400000);
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(
            Option.some({ ...baseState, pendingDeletionUntil: Option.some(existing) }),
          ),
        ),
      });
      const service = buildService({ repo, email });

      const result = await service.requestAccountDeletion({ userId: "u1", password: "anything" });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().pendingDeletionUntil).toBe(existing.toISOString());
      expect(repo.markPendingDeletion).not.toHaveBeenCalled();
    });
  });

  describe("cancelAccountDeletion", () => {
    it("clears the pending column and emails when a deletion is pending", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(
            Option.some({
              ...baseState,
              pendingDeletionUntil: Option.some(new Date(Date.now() + 86400000)),
            }),
          ),
        ),
      });
      const service = buildService({ repo, email });

      const result = await service.cancelAccountDeletion({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(repo.clearPendingDeletion).toHaveBeenCalledWith("u1");
      expect(email.sendTemplate).toHaveBeenCalledWith(
        "delete_cancelled",
        "u@example.com",
        expect.objectContaining({ name: "User" }),
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
    });

    it("returns ACCOUNT_DELETION_NOT_FOUND when nothing is pending", async () => {
      const repo = makeRepo();
      const service = buildService({ repo, email });

      const result = await service.cancelAccountDeletion({ userId: "u1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_DELETION_NOT_FOUND");
      expect(repo.clearPendingDeletion).not.toHaveBeenCalled();
    });
  });

  describe("executeAccountWipe", () => {
    const elapsedState: UserDeletionState = {
      ...baseState,
      pendingDeletionUntil: Option.some(new Date(Date.now() - 1000)),
    };

    it("anonymizes via repo and emails the user", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(Option.some(elapsedState)),
        ),
      });
      const outbox = mockPort<IOutboxRepository>();
      const service = buildService({ repo, email, outbox });

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(repo.executeWipe).toHaveBeenCalled();
      expect(enqueuedEvents(outbox).map((e) => e.eventType)).toEqual([EventTypes.USER_DELETED]);
      expect(email.sendTemplate).toHaveBeenCalledWith(
        "delete_completed",
        "u@example.com",
        { name: "User" },
        expect.objectContaining({ idempotencyKey: "delete-completed/u1" }),
      );
    });

    it("enqueues the confirmation inside the wipe transaction", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(Option.some(elapsedState)),
        ),
      });
      const sentInside: boolean[] = [];
      (email.sendTemplate as unknown as ReturnType<typeof mock>).mockImplementation(async () => {
        sentInside.push(UnitOfWorkContext.transaction() !== undefined);
        return Result.ok();
      });
      const service = buildService({ repo, email });

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(uow.outcome()).toBe("committed");
      expect(sentInside).toEqual([true]);
      expect(email.sendTemplate).toHaveBeenCalledTimes(1);
      const call = (
        email.sendTemplate as unknown as {
          mock: {
            calls: [string, string, unknown, { idempotencyKey?: string }][];
          };
        }
      ).mock.calls[0];
      if (!call) throw new Error("sendTemplate was not called");
      const [template, to, variables, options] = call;
      expect(template).toBe("delete_completed");
      expect(to).toBe("u@example.com");
      expect(variables).toEqual({ name: "User" });
      expect(options.idempotencyKey).toBe("delete-completed/u1");
    });

    it("aborts the wipe transaction when the confirmation cannot be enqueued", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(Option.some(elapsedState)),
        ),
      });
      const failEmail: IEmailService = {
        ...makeEmail(),
        sendTemplate: mock(async () =>
          Result.fail<void, EmailError>({ code: "EMAIL_PROVIDER_FAILURE", message: "boom" }),
        ),
      };
      const service = buildService({ repo, email: failEmail });

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_WIPE_NOTIFY_PROVIDER_FAILURE");
      expect(uow.outcome()).toBe("rolled_back");
    });

    it("reports a generic provider failure and captures the error when the ROLLBACK itself throws", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(Option.some(elapsedState)),
        ),
      });
      const failEmail: IEmailService = {
        ...makeEmail(),
        sendTemplate: mock(async () =>
          Result.fail<void, EmailError>({ code: "EMAIL_PROVIDER_FAILURE", message: "boom" }),
        ),
      };
      const brokenTx = throwingUnitOfWork("connection terminated unexpectedly");
      const captured: unknown[] = [];
      const capturingInstrumentation = new NoOpInstrumentation();
      capturingInstrumentation.capture = (err: unknown) => {
        captured.push(err);
      };

      const service = buildService({
        repo,
        email: failEmail,
        uow: brokenTx,
        instrumentation: capturingInstrumentation,
      });

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_WIPE_PROVIDER_FAILURE");
      expect(captured).toHaveLength(1);
    });

    it("short-circuits without emitting USER_DELETED when the repository reports the row already wiped (lost race, no SKIP LOCKED on rgpd-sweep)", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(Option.some(elapsedState)),
        ),
        executeWipe: mock(async () =>
          Result.ok<ExecuteWipeOutput, RgpdError>({ alreadyWiped: true }),
        ),
      });
      const spyOutbox = mockPort<IOutboxRepository>();
      const service = buildService({ repo, email, outbox: spyOutbox });

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(enqueuedEvents(spyOutbox)).toHaveLength(0);
    });

    it("returns success no-op when user is already deleted", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(
            Option.some({
              email: "deleted@anonymized.local",
              name: "[deleted]",
              pendingDeletionUntil: Option.none(),
              deletedAt: Option.some(new Date()),
            }),
          ),
        ),
      });
      const service = buildService({ repo, email });

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().alreadyWiped).toBe(true);
      expect(repo.executeWipe).not.toHaveBeenCalled();
    });

    it("rejects when grace has not elapsed yet", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(
            Option.some({
              ...baseState,
              pendingDeletionUntil: Option.some(new Date(Date.now() + 86400000)),
            }),
          ),
        ),
      });
      const service = buildService({ repo, email });

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_DELETION_NOT_FOUND");
      expect(repo.executeWipe).not.toHaveBeenCalled();
    });
  });

  describe("processPendingDeletions", () => {
    const pendingRows: PendingDeletionRow[] = [
      { userId: "u1", email: "u1@example.com", pendingDeletionUntil: new Date(Date.now() - 1000) },
      { userId: "u2", email: "u2@example.com", pendingDeletionUntil: new Date(Date.now() - 1000) },
      { userId: "u3", email: "u3@example.com", pendingDeletionUntil: new Date(Date.now() - 1000) },
    ];

    function makeBatchRepo(
      rows: PendingDeletionRow[],
      overrides: Partial<IRgpdRepository> = {},
    ): IRgpdRepository {
      return makeRepo({
        findUsersReadyForWipe: mock(async () => Result.ok<PendingDeletionRow[], RgpdError>(rows)),
        getUserDeletionState: mock(async (userId: string) =>
          Result.ok<Option<UserDeletionState>, RgpdError>(
            Option.some(graceElapsedStateFor(userId)),
          ),
        ),
        ...overrides,
      });
    }

    it("returns the pending list without calling wipe in dryRun mode", async () => {
      const repo = makeBatchRepo(pendingRows);
      const service = buildService({ repo, email });

      const result = await service.processPendingDeletions({ batchSize: 50, dryRun: true });

      expect(result.isSuccess).toBe(true);
      const output = result.getValue();
      expect(output.dryRun).toBe(true);
      expect(output.processed).toBe(3);
      expect(output.succeeded).toEqual(["u1", "u2", "u3"]);
      expect(output.failed).toEqual([]);
      expect(repo.executeWipe).not.toHaveBeenCalled();
    });

    it("fails the sweep when the batch cannot be loaded", async () => {
      const repo = makeBatchRepo([], {
        findUsersReadyForWipe: mock(async () =>
          Result.fail<PendingDeletionRow[], RgpdError>({
            code: "RGPD_REPOSITORY_PROVIDER_FAILURE",
            message: "down",
          }),
        ),
      });
      const service = buildService({ repo, email });

      const result = await service.processPendingDeletions({});

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("RGPD_REPOSITORY_PROVIDER_FAILURE");
    });

    it("only requests up to batchSize rows from the repo", async () => {
      const repo = makeBatchRepo(pendingRows.slice(0, 2), {
        findUsersReadyForWipe: mock(async (limit: number) =>
          Result.ok<PendingDeletionRow[], RgpdError>(pendingRows.slice(0, limit)),
        ),
      });
      const service = buildService({ repo, email });

      const result = await service.processPendingDeletions({ batchSize: 2 });

      expect(result.isSuccess).toBe(true);
      expect(repo.findUsersReadyForWipe).toHaveBeenCalledWith(2);
      expect(result.getValue().processed).toBe(2);
    });

    it("processes all rows and reports successes (happy path)", async () => {
      const repo = makeBatchRepo(pendingRows);
      const service = buildService({ repo, email });

      const result = await service.processPendingDeletions({});

      expect(result.isSuccess).toBe(true);
      const output = result.getValue();
      expect(output.dryRun).toBe(false);
      expect(output.processed).toBe(3);
      expect(output.succeeded).toHaveLength(3);
      expect(output.failed).toHaveLength(0);
    });

    it("aggregates failures without throwing while other users are still processed", async () => {
      const repo = makeBatchRepo(pendingRows, {
        getUserDeletionState: mock(async (userId: string) => {
          if (userId === "u2") {
            return Result.ok<Option<UserDeletionState>, RgpdError>(Option.none());
          }
          return Result.ok<Option<UserDeletionState>, RgpdError>(
            Option.some(graceElapsedStateFor(userId)),
          );
        }),
      });
      const service = buildService({ repo, email });

      const result = await service.processPendingDeletions({});

      expect(result.isSuccess).toBe(true);
      const output = result.getValue();
      expect(output.processed).toBe(3);
      expect(output.succeeded).toContain("u1");
      expect(output.succeeded).toContain("u3");
      expect(output.failed.some((f) => f.userId === "u2")).toBe(true);
    });

    it("sends one enqueue per account rather than one batch", async () => {
      const emailMock = makeEmail();
      const service = makeService({ email: emailMock, readyForWipe: ["u1", "u2", "u3"] });

      const result = await service.processPendingDeletions({ batchSize: 50 });

      expect(result.getValue().succeeded).toHaveLength(3);
      expect(emailMock.sendTemplate).toHaveBeenCalledTimes(3);
      expect(emailMock.sendTemplateBatch).not.toHaveBeenCalled();
    });

    it("does not send anything when every wipe fails", async () => {
      const emailMock = makeEmail();
      const service = makeService({ email: emailMock, readyForWipe: ["u1"], wipeFails: true });

      await service.processPendingDeletions({ batchSize: 50 });

      expect(emailMock.sendTemplate).not.toHaveBeenCalled();
      expect(emailMock.sendTemplateBatch).not.toHaveBeenCalled();
    });

    it("stops between wipes once the budget is spent and reports truncated", async () => {
      // A clock that jumps 60ms per read: deadlineAt = 60 + 100 = 160. The first
      // in-loop check reads 120 (< 160, wipe runs); the second reads 180 (>= 160,
      // stop before starting the next wipe): one account wiped, two deferred.
      let readCount = 0;
      const fakeClock = () => {
        readCount += 1;
        return readCount * 60;
      };
      const repo = makeBatchRepo(pendingRows);
      const service = buildService({ repo, email });

      const result = await service.processPendingDeletions({
        batchSize: 3,
        dryRun: false,
        deadlineMs: 100,
        now: fakeClock,
      });

      expect(result.isSuccess).toBe(true);
      const output = result.getValue();
      expect(output.succeeded).toHaveLength(1);
      expect(output.succeeded.length).toBeLessThan(3);
      expect(output.truncated).toBe(true);
      expect(output.processed).toBe(output.succeeded.length + output.failed.length);
      expect(output.processed).toBeLessThan(3);
    });

    it("reports truncated: false when every account finishes inside the budget", async () => {
      const repo = makeBatchRepo(pendingRows);
      const service = buildService({ repo, email });

      const result = await service.processPendingDeletions({
        batchSize: 3,
        dryRun: false,
        deadlineMs: 100,
        now: () => 0,
      });

      expect(result.isSuccess).toBe(true);
      const output = result.getValue();
      expect(output.succeeded).toHaveLength(3);
      expect(output.truncated).toBe(false);
    });

    it("records ACCOUNT_WIPE_PROVIDER_FAILURE when the wipe transaction throws", async () => {
      const badRows: PendingDeletionRow[] = [
        {
          userId: "u1",
          email: "u1@example.com",
          pendingDeletionUntil: new Date(Date.now() - 1000),
        },
      ];
      const repo = makeBatchRepo(badRows);
      const badTx = throwingUnitOfWork("db failure");
      const service = buildService({ repo, email, uow: badTx });

      const result = await service.processPendingDeletions({});

      expect(result.isSuccess).toBe(true);
      const output = result.getValue();
      expect(output.failed).toHaveLength(1);
      expect(output.failed[0]?.errorCode).toBe("ACCOUNT_WIPE_PROVIDER_FAILURE");
    });
  });
});
