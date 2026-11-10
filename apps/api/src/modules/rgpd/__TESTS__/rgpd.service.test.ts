import { beforeEach, describe, expect, it } from "bun:test";
import {
  type AppError,
  type ILogger,
  type IUnitOfWork,
  Option,
  Result,
  UnitOfWorkContext,
} from "@packages/ddd-kit";
import type { EmailError, IEmailService } from "@packages/email/email.port";
import { EventTypes } from "@packages/events";
import { readActorId } from "@packages/outbox/event-actor";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type {
  ChildRevocationTally,
  IChildConnections,
} from "../application/ports/child-connections.port";
import type {
  IRgpdRepository,
  PendingDeletionRow,
  RgpdError,
  UserDeletionState,
} from "../application/ports/rgpd.port";
import { RgpdService } from "../application/services/rgpd.service";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-11-09T10:00:00.000Z");

const activeState: UserDeletionState = {
  email: "parent@example.com",
  name: "Parent",
  pendingDeletionUntil: Option.none(),
};

const elapsedState: UserDeletionState = {
  ...activeState,
  pendingDeletionUntil: Option.some(new Date(NOW.getTime() - 1000)),
};

interface Fixture {
  repo: PortMock<IRgpdRepository>;
  children: PortMock<IChildConnections>;
  email: PortMock<IEmailService>;
  outbox: PortMock<IOutboxRepository>;
  uow: UnitOfWorkMock;
  timeline: string[];
  service(unitOfWork?: IUnitOfWork, clock?: () => Date): RgpdService;
}

function fixture(state: UserDeletionState = activeState): Fixture {
  const timeline: string[] = [];
  const repo = mockPort<IRgpdRepository>();
  repo.getUserDeletionState.mockImplementation(async () => Result.ok(Option.some(state)));
  repo.findSessionStart.mockImplementation(async () =>
    Result.ok(Option.some(new Date(NOW.getTime() - HOUR))),
  );
  repo.markPendingDeletion.mockImplementation(async () => Result.ok(true));
  repo.clearPendingDeletion.mockImplementation(async () => Result.ok(true));
  repo.findUsersReadyForWipe.mockImplementation(async () => Result.ok([]));
  repo.executeWipe.mockImplementation(async () => {
    timeline.push("wipe");
    return Result.ok({ alreadyWiped: false });
  });

  const children = mockPort<IChildConnections>();
  children.revokeAll.mockImplementation(async () => {
    timeline.push("revoke");
    return Result.ok({ revoked: 2, failed: 0 });
  });

  const email = mockPort<IEmailService>();
  email.sendTemplate.mockImplementation(async () => Result.ok());

  const outbox = mockPort<IOutboxRepository>();
  const uow = mockUnitOfWork();

  return {
    repo,
    children,
    email,
    outbox,
    uow,
    timeline,
    service: (unitOfWork = uow.unitOfWork, clock = () => NOW) =>
      new RgpdService(
        repo,
        children,
        email,
        unitOfWork,
        outbox,
        new NoOpInstrumentation(),
        {
          appUrl: "https://app.example.com",
          gracePeriodDays: 7,
          freshSessionMaxAgeMs: 24 * HOUR,
          sweepDeadlineMs: 90_000,
        },
        mockPort<ILogger>(),
        clock,
      ),
  };
}

function rows(...entries: [string, Date][]): PendingDeletionRow[] {
  return entries.map(([userId, pendingDeletionUntil]) => ({ userId, pendingDeletionUntil }));
}

describe("RgpdService", () => {
  describe("requestAccountDeletion", () => {
    it("given a Google-only parent with a fresh session, schedules the deletion without any password", async () => {
      const f = fixture();

      const result = await f.service().requestAccountDeletion({ userId: "u1", sessionId: "s1" });

      expect(result.isSuccess).toBe(true);
      expect(f.repo.markPendingDeletion).toHaveBeenCalledWith(
        "u1",
        new Date(NOW.getTime() + 7 * 24 * HOUR),
      );
      const [requested] = enqueuedEvents(f.outbox);
      expect(requested?.eventType).toBe(EventTypes.USER_DELETION_REQUESTED);
      expect(readActorId(requested?.payload).unwrapOr("none")).toBe("u1");
      expect(f.uow.outcome()).toBe("committed");
    });

    it("given a session older than the fresh age, asks to sign in again and schedules nothing", async () => {
      const f = fixture();
      f.repo.findSessionStart.mockImplementation(async () =>
        Result.ok(Option.some(new Date(NOW.getTime() - 25 * HOUR))),
      );

      const result = await f.service().requestAccountDeletion({ userId: "u1", sessionId: "s1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_REAUTH_REQUIRED");
      expect(f.repo.markPendingDeletion).not.toHaveBeenCalled();
      expect(enqueuedEvents(f.outbox)).toHaveLength(0);
    });

    it("given a session that is not the user's, asks to sign in again", async () => {
      const f = fixture();
      f.repo.findSessionStart.mockImplementation(async () => Result.ok(Option.none()));

      const result = await f.service().requestAccountDeletion({ userId: "u1", sessionId: "s2" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_REAUTH_REQUIRED");
    });

    it("given a concurrent request already marked the account, announces nothing twice", async () => {
      const until = new Date(NOW.getTime() + 7 * 24 * HOUR);
      const f = fixture();
      f.repo.markPendingDeletion.mockImplementation(async () => Result.ok(false));
      f.repo.getUserDeletionState
        .mockImplementationOnce(async () => Result.ok(Option.some(activeState)))
        .mockImplementationOnce(async () =>
          Result.ok(Option.some({ ...activeState, pendingDeletionUntil: Option.some(until) })),
        );

      const result = await f.service().requestAccountDeletion({ userId: "u1", sessionId: "s1" });

      expect(result.getValue().pendingDeletionUntil).toBe(until.toISOString());
      expect(enqueuedEvents(f.outbox)).toHaveLength(0);
      expect(f.email.sendTemplate).not.toHaveBeenCalled();
    });

    it("given a deletion already pending, returns its date without re-marking", async () => {
      const until = new Date(NOW.getTime() + 24 * HOUR);
      const f = fixture({ ...activeState, pendingDeletionUntil: Option.some(until) });

      const result = await f.service().requestAccountDeletion({ userId: "u1", sessionId: "s1" });

      expect(result.getValue().pendingDeletionUntil).toBe(until.toISOString());
      expect(f.repo.markPendingDeletion).not.toHaveBeenCalled();
    });
  });

  describe("cancelAccountDeletion", () => {
    it("given the grace period has elapsed, refuses the cancellation and clears nothing", async () => {
      const f = fixture({
        ...activeState,
        pendingDeletionUntil: Option.some(new Date(NOW.getTime() - 1000)),
      });

      const result = await f.service().cancelAccountDeletion({ userId: "u1" });

      expect(result.getError().code).toBe("ACCOUNT_DELETION_CANCEL_CONFLICT");
      expect(f.repo.clearPendingDeletion).not.toHaveBeenCalled();
      expect(enqueuedEvents(f.outbox)).toHaveLength(0);
    });

    it("given the sweep took the account between the read and the write, refuses the cancellation", async () => {
      const f = fixture({
        ...activeState,
        pendingDeletionUntil: Option.some(new Date(NOW.getTime() + HOUR)),
      });
      f.repo.clearPendingDeletion.mockImplementation(async () => Result.ok(false));

      const result = await f.service().cancelAccountDeletion({ userId: "u1" });

      expect(result.getError().code).toBe("ACCOUNT_DELETION_CANCEL_CONFLICT");
      expect(enqueuedEvents(f.outbox)).toHaveLength(0);
    });

    it("given a pending deletion, clears it and announces the cancellation", async () => {
      const f = fixture({
        ...activeState,
        pendingDeletionUntil: Option.some(new Date(NOW.getTime() + HOUR)),
      });

      const result = await f.service().cancelAccountDeletion({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(enqueuedEvents(f.outbox).map((e) => e.eventType)).toEqual([
        EventTypes.USER_DELETION_CANCELLED,
      ]);
    });

    it("given nothing pending, answers ACCOUNT_DELETION_NOT_FOUND", async () => {
      const f = fixture();

      const result = await f.service().cancelAccountDeletion({ userId: "u1" });

      expect(result.getError().code).toBe("ACCOUNT_DELETION_NOT_FOUND");
      expect(f.repo.clearPendingDeletion).not.toHaveBeenCalled();
    });
  });

  describe("executeAccountWipe", () => {
    it("given a user with 2 children, revokes their tokens before deleting the user", async () => {
      const f = fixture(elapsedState);

      const result = await f.service().executeAccountWipe({ userId: "u1", now: NOW });

      expect(result.isSuccess).toBe(true);
      expect(f.timeline).toEqual(["revoke", "wipe"]);
      expect(f.uow.outcome()).toBe("committed");
    });

    it("given Google refuses every revocation, still erases the account", async () => {
      const f = fixture(elapsedState);
      f.children.revokeAll.mockImplementation(async () =>
        Result.ok<ChildRevocationTally, AppError>({ revoked: 0, failed: 2 }),
      );

      const result = await f.service().executeAccountWipe({ userId: "u1", now: NOW });

      expect(result.isSuccess).toBe(true);
      expect(f.repo.executeWipe).toHaveBeenCalledTimes(1);
      expect(enqueuedEvents(f.outbox).map((e) => e.eventType)).toEqual([EventTypes.USER_DELETED]);
    });

    it("given the revocation itself fails, still erases the account", async () => {
      const f = fixture(elapsedState);
      f.children.revokeAll.mockImplementation(async () =>
        Result.fail<ChildRevocationTally, AppError>({
          code: "CHILD_PROVIDER_FAILURE",
          message: "down",
        }),
      );

      const result = await f.service().executeAccountWipe({ userId: "u1", now: NOW });

      expect(result.isSuccess).toBe(true);
      expect(f.repo.executeWipe).toHaveBeenCalledTimes(1);
    });

    it("announces the deletion without any personal data and confirms it by email inside the transaction", async () => {
      const f = fixture(elapsedState);
      const sentInside: boolean[] = [];
      f.email.sendTemplate.mockImplementation(async () => {
        sentInside.push(UnitOfWorkContext.transaction() !== undefined);
        return Result.ok();
      });

      await f.service().executeAccountWipe({ userId: "u1", now: NOW });

      const [deleted] = enqueuedEvents(f.outbox);
      expect(deleted?.payload).toEqual({ userId: "u1", deletedAt: NOW });
      expect(JSON.stringify(deleted?.payload)).not.toContain("@");
      expect(sentInside).toEqual([true]);
      expect(f.email.sendTemplate).toHaveBeenCalledWith(
        "delete_completed",
        "parent@example.com",
        { name: "Parent" },
        { idempotencyKey: "delete-completed/u1" },
      );
    });

    it("given the deletion transaction fails, nothing is committed and the deletion is not announced", async () => {
      const f = fixture(elapsedState);
      f.repo.executeWipe.mockImplementation(async () =>
        Result.fail({ code: "RGPD_REPOSITORY_PROVIDER_FAILURE", message: "down" }),
      );

      const result = await f.service().executeAccountWipe({ userId: "u1", now: NOW });

      expect(result.getError().code).toBe("ACCOUNT_WIPE_PROVIDER_FAILURE");
      expect(f.uow.outcome()).toBe("rolled_back");
      expect(enqueuedEvents(f.outbox)).toHaveLength(0);
    });

    it("given the confirmation email cannot be queued, rolls the wipe back", async () => {
      const f = fixture(elapsedState);
      f.email.sendTemplate.mockImplementation(async () =>
        Result.fail<void, EmailError>({ code: "EMAIL_PROVIDER_FAILURE", message: "boom" }),
      );

      const result = await f.service().executeAccountWipe({ userId: "u1", now: NOW });

      expect(result.getError().code).toBe("ACCOUNT_WIPE_NOTIFY_PROVIDER_FAILURE");
      expect(f.uow.outcome()).toBe("rolled_back");
    });

    it("given the transaction throws, reports a provider failure", async () => {
      const f = fixture(elapsedState);
      const broken = mockUnitOfWork().unitOfWork;
      broken.run.mockImplementation(async () => {
        throw new Error("connection terminated unexpectedly");
      });

      const result = await f.service(broken).executeAccountWipe({ userId: "u1", now: NOW });

      expect(result.getError().code).toBe("ACCOUNT_WIPE_PROVIDER_FAILURE");
    });

    it("given another run already deleted the user, does not announce the deletion twice", async () => {
      const f = fixture(elapsedState);
      f.repo.executeWipe.mockImplementation(async () => Result.ok({ alreadyWiped: true }));

      const result = await f.service().executeAccountWipe({ userId: "u1", now: NOW });

      expect(result.getValue().alreadyWiped).toBe(true);
      expect(enqueuedEvents(f.outbox)).toHaveLength(0);
      expect(f.email.sendTemplate).not.toHaveBeenCalled();
    });

    it("given the grace period is still running, refuses and revokes nothing", async () => {
      const f = fixture({
        ...activeState,
        pendingDeletionUntil: Option.some(new Date(NOW.getTime() + HOUR)),
      });

      const result = await f.service().executeAccountWipe({ userId: "u1", now: NOW });

      expect(result.getError().code).toBe("ACCOUNT_DELETION_NOT_FOUND");
      expect(f.children.revokeAll).not.toHaveBeenCalled();
      expect(f.repo.executeWipe).not.toHaveBeenCalled();
    });
  });

  describe("processPendingDeletions", () => {
    let f: Fixture;

    beforeEach(() => {
      f = fixture(elapsedState);
    });

    it("given a pending deletion still inside its grace period, skips it", async () => {
      f.repo.findUsersReadyForWipe.mockImplementation(async () =>
        Result.ok(
          rows(["due", new Date(NOW.getTime() - HOUR)], ["grace", new Date(NOW.getTime() + HOUR)]),
        ),
      );

      const result = await f.service().processPendingDeletions({ now: NOW });

      expect(result.getValue().succeeded).toEqual(["due"]);
      expect(result.getValue().failed).toEqual([]);
      expect(f.repo.executeWipe).toHaveBeenCalledTimes(1);
    });

    it("given dryRun, lists the due accounts and changes nothing", async () => {
      f.repo.findUsersReadyForWipe.mockImplementation(async () =>
        Result.ok(rows(["u1", NOW], ["u2", NOW])),
      );

      const result = await f.service().processPendingDeletions({ now: NOW, dryRun: true });

      expect(result.getValue()).toMatchObject({ dryRun: true, succeeded: ["u1", "u2"] });
      expect(f.children.revokeAll).not.toHaveBeenCalled();
      expect(f.repo.executeWipe).not.toHaveBeenCalled();
      expect(enqueuedEvents(f.outbox)).toHaveLength(0);
    });

    it("given one wipe fails, the others still go through", async () => {
      f.repo.findUsersReadyForWipe.mockImplementation(async () =>
        Result.ok(rows(["u1", NOW], ["u2", NOW], ["u3", NOW])),
      );
      f.repo.getUserDeletionState.mockImplementation(async (userId: string) =>
        Result.ok(userId === "u2" ? Option.none() : Option.some(elapsedState)),
      );

      const result = await f.service().processPendingDeletions({ now: NOW });

      expect(result.getValue().succeeded).toEqual(["u1", "u3"]);
      expect(result.getValue().failed).toEqual([
        { userId: "u2", errorCode: "ACCOUNT_DELETION_NOT_FOUND" },
      ]);
    });

    it("given the batch cannot be loaded, fails the sweep", async () => {
      f.repo.findUsersReadyForWipe.mockImplementation(async () =>
        Result.fail<PendingDeletionRow[], RgpdError>({
          code: "RGPD_REPOSITORY_PROVIDER_FAILURE",
          message: "down",
        }),
      );

      const result = await f.service().processPendingDeletions({ now: NOW });

      expect(result.getError().code).toBe("RGPD_REPOSITORY_PROVIDER_FAILURE");
    });

    it("given the time budget is spent, stops between two wipes and reports truncated", async () => {
      f.repo.findUsersReadyForWipe.mockImplementation(async () =>
        Result.ok(rows(["u1", NOW], ["u2", NOW], ["u3", NOW])),
      );
      let reads = 0;
      const clock = () => {
        reads += 1;
        return new Date(NOW.getTime() + reads * 60);
      };

      const result = await f
        .service(undefined, clock)
        .processPendingDeletions({ now: NOW, deadlineMs: 100 });

      expect(result.getValue()).toMatchObject({ succeeded: ["u1"], truncated: true });
    });
  });
});
