import { describe, expect, it } from "bun:test";
import { type AppError, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { readActorId } from "@packages/outbox/event-actor";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type { UserDataSnapshot } from "../application/dto/user-data-export.dto";
import type { DataExportAccount, IRgpdRepository } from "../application/ports/rgpd.port";
import type { IUserDataReader } from "../application/ports/user-data-reader.port";
import { DataExportService } from "../application/services/data-export.service";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-11-12T23:30:00.000Z");

const snapshot: UserDataSnapshot = {
  children: [
    {
      id: "c1",
      label: "Léa",
      googleEmail: "lea@school.example",
      color: 3,
      avatarUrl: null,
      status: "connected",
      connectedAt: "2026-09-01T08:00:00.000Z",
      lastSyncedAt: "2026-11-12T22:00:00.000Z",
    },
  ],
  events: [],
  defaultReminders: [{ kind: "days_before", days: 1, time: "18:00" }],
  alerts: [],
  pushSubscriptions: [
    { endpointHost: "fcm.googleapis.com", createdAt: "2026-09-02T08:00:00.000Z" },
  ],
  calendarFeed: null,
  quietHours: null,
  weeklyDigest: { enabled: true, chosenAt: null, weeks: [] },
  sync: [],
};

function account(lastDataExportAt: Option<Date>): DataExportAccount {
  return {
    name: "Parent",
    email: "parent@example.com",
    createdAt: new Date("2026-09-01T07:00:00.000Z"),
    lastDataExportAt,
  };
}

interface Fixture {
  repo: PortMock<IRgpdRepository>;
  reader: PortMock<IUserDataReader>;
  outbox: PortMock<IOutboxRepository>;
  uow: UnitOfWorkMock;
  service: DataExportService;
}

function fixture(lastDataExportAt: Option<Date> = Option.none()): Fixture {
  const repo = mockPort<IRgpdRepository>();
  repo.lockDataExportAccount.mockImplementation(async () =>
    Result.ok(Option.some(account(lastDataExportAt))),
  );
  repo.markDataExported.mockImplementation(async () => Result.ok());

  const reader = mockPort<IUserDataReader>();
  reader.collect.mockImplementation(async () => Result.ok(snapshot));

  const outbox = mockPort<IOutboxRepository>();
  const uow = mockUnitOfWork();

  return {
    repo,
    reader,
    outbox,
    uow,
    service: new DataExportService(
      repo,
      reader,
      uow.unitOfWork,
      outbox,
      new NoOpInstrumentation(),
      () => NOW,
    ),
  };
}

describe("DataExportService.requestExport", () => {
  it("given a parent who never exported, hands back their data as a dated file and records the request", async () => {
    const f = fixture();

    const result = await f.service.requestExport({ userId: "u1" });

    expect(result.isSuccess).toBe(true);
    const exported = result.getValue();
    expect(exported.fileName).toBe("classroom-parents-export-2026-11-13.json");
    expect(exported.document).toEqual({
      format: "classroom-parents-export",
      version: 1,
      exportedAt: NOW.toISOString(),
      account: {
        name: "Parent",
        email: "parent@example.com",
        createdAt: "2026-09-01T07:00:00.000Z",
      },
      ...snapshot,
    });
    expect(f.reader.collect).toHaveBeenCalledWith("u1");
    expect(f.repo.markDataExported).toHaveBeenCalledWith("u1", NOW);
    expect(f.uow.outcome()).toBe("committed");

    const [requested] = enqueuedEvents(f.outbox);
    expect(requested?.eventType).toBe(EventTypes.USER_DATA_EXPORT_REQUESTED);
    expect(requested?.aggregateId).toBe("u1");
    expect(readActorId(requested?.payload).toNull()).toBe("u1");
  });

  it("given a parent who exported less than 24 h ago, refuses with the moment the next export opens", async () => {
    const last = new Date(NOW.getTime() - 23 * HOUR);
    const f = fixture(Option.some(last));

    const result = await f.service.requestExport({ userId: "u1" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("DATA_EXPORT_RATE_LIMITED");
    expect(result.getError().metadata).toEqual({
      retryAt: new Date(last.getTime() + 24 * HOUR).toISOString(),
    });
    expect(f.reader.collect).not.toHaveBeenCalled();
    expect(f.repo.markDataExported).not.toHaveBeenCalled();
    expect(enqueuedEvents(f.outbox)).toHaveLength(0);
  });

  it("given a parent whose last export is 24 h old, lets them export again", async () => {
    const f = fixture(Option.some(new Date(NOW.getTime() - 24 * HOUR)));

    const result = await f.service.requestExport({ userId: "u1" });

    expect(result.isSuccess).toBe(true);
    expect(f.repo.markDataExported).toHaveBeenCalledWith("u1", NOW);
  });

  it("given the data cannot be read, rolls the request back so the parent can retry at once", async () => {
    const f = fixture();
    const failure: AppError = { code: "DATA_EXPORT_PROVIDER_FAILURE", message: "read failed" };
    f.reader.collect.mockImplementation(async () => Result.fail(failure));

    const result = await f.service.requestExport({ userId: "u1" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("DATA_EXPORT_PROVIDER_FAILURE");
    expect(f.uow.outcome()).toBe("rolled_back");
  });
});
