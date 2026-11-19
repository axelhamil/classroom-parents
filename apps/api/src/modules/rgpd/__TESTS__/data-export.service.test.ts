import { describe, expect, it } from "bun:test";
import { type AppError, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { readActorId } from "@packages/outbox/event-actor";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type { CollectedEvent, UserDataSnapshot } from "../application/dto/user-data-export.dto";
import type { CourseName, ICourseNames } from "../application/ports/course-names.port";
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
      showsPhoto: false,
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
  lockScreen: { details: false, chosenAt: null },
  weeklyDigest: { enabled: true, chosenAt: null, weeks: [] },
  accessLossWarnings: [],
  schoolZone: null,
  assistantPreferences: null,
  aiUsage: [],
  aiCalls: [],
  homeLayout: null,
  homeNote: null,
  sync: [],
};

function collected(id: string, courseId: string | null): CollectedEvent {
  return {
    id,
    childId: "c1",
    source: courseId ? "announcement" : "manual",
    courseId,
    announcementUrl: null,
    title: `Échéance ${id}`,
    description: "",
    category: "homework",
    deadlineDate: "2026-11-19",
    deadlineTime: null,
    deadlineAt: "2026-11-19T22:59:00.000Z",
    receivedAt: "2026-11-10T08:00:00.000Z",
    status: "confirmed",
    reviewReasons: [],
    evidenceQuote: null,
    evidenceStart: null,
    evidenceEnd: null,
    evidenceBefore: "",
    evidenceAfter: "",
    parentActions: [],
    toBring: [],
    amendReason: null,
    confirmedByParentAt: null,
    done: false,
    checklist: { done: [], removed: [], extra: [] },
    editedAt: null,
    editedFields: [],
    deletedAt: null,
    withdrawnAt: null,
    createdAt: "2026-11-10T08:00:00.000Z",
    reminders: null,
  };
}

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
  courseNames: PortMock<ICourseNames>;
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

  const courseNames = mockPort<ICourseNames>();
  courseNames.namesOf.mockImplementation(async () =>
    Result.ok<CourseName[], AppError>([
      { childId: "c1", courseId: "maths", name: "Mathématiques 4e B" },
    ]),
  );

  const outbox = mockPort<IOutboxRepository>();
  const uow = mockUnitOfWork();

  return {
    repo,
    reader,
    courseNames,
    outbox,
    uow,
    service: new DataExportService(
      repo,
      reader,
      courseNames,
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
      events: [],
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

  it("given deadlines from Classroom and one added by hand, each carries the course name the parent sees in the app", async () => {
    const f = fixture();
    f.reader.collect.mockImplementation(async () =>
      Result.ok({
        ...snapshot,
        events: [collected("e1", "maths"), collected("e2", "maths"), collected("e3", null)],
      }),
    );

    const result = await f.service.requestExport({ userId: "u1" });

    expect(f.courseNames.namesOf).toHaveBeenCalledWith([{ childId: "c1", courseId: "maths" }]);
    expect(result.getValue().document.events.map(({ id, course }) => [id, course])).toEqual([
      ["e1", { id: "maths", name: "Mathématiques 4e B" }],
      ["e2", { id: "maths", name: "Mathématiques 4e B" }],
      ["e3", null],
    ]);
  });

  it("given the course names cannot be read, refuses an incomplete export and rolls the request back", async () => {
    const f = fixture();
    f.reader.collect.mockImplementation(async () =>
      Result.ok({ ...snapshot, events: [collected("e1", "maths")] }),
    );
    f.courseNames.namesOf.mockImplementation(async () =>
      Result.fail<CourseName[], AppError>({ code: "SYNC_PROVIDER_FAILURE", message: "db" }),
    );

    const result = await f.service.requestExport({ userId: "u1" });

    expect(result.getError().code).toBe("SYNC_PROVIDER_FAILURE");
    expect(f.uow.outcome()).toBe("rolled_back");
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
