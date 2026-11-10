import {
  type AppError,
  type IInstrumentation,
  type ILogger,
  Option,
  Result,
} from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import type {
  ExtractedDeadline,
  IAnnouncementExtractor,
} from "../application/ports/announcement-extractor.port";
import type { IChildAccessTokens } from "../application/ports/child-access-tokens.port";
import type { IChildSyncState } from "../application/ports/child-sync-state.port";
import type {
  Announcement,
  ClassroomError,
  ClassroomErrorCode,
  Course,
  Coursework,
  IClassroomClient,
} from "../application/ports/classroom-client.port";
import type { IEventIngest } from "../application/ports/event-ingest.port";
import type {
  ISeenAnnouncementRepository,
  LedgerEntry,
  SeenAnnouncement,
} from "../application/ports/seen-announcement-repository.port";
import { ClassroomReader } from "../application/services/classroom-reader.service";
import { SyncChildService } from "../application/services/sync-child.service";
import type { SyncError } from "../application/sync-error";

export const NOW = new Date("2026-11-09T10:00:00.000Z");
export const DAY_MS = 24 * 60 * 60_000;
export const CHILD = { userId: "parent-1", childId: "child-1", label: "Léa", lease: 7 };

export function announcement(id: string, courseId: string, daysAgo = 2): Announcement {
  return {
    id,
    courseId,
    text: `Annonce ${id}`,
    publishedAt: new Date(NOW.getTime() - daysAgo * DAY_MS),
    url: `https://classroom.google.com/c/${courseId}/p/${id}`,
  };
}

export function deadline(title: string): ExtractedDeadline {
  return {
    title,
    description: `${title} à préparer`,
    category: "homework",
    deadlineDate: "2026-11-19",
    needsReview: false,
  };
}

export function coursework(
  id: string,
  courseId: string,
  due?: { date: string; time?: string },
): Coursework {
  return {
    id,
    courseId,
    title: `Devoir ${id}`,
    url: `https://classroom.google.com/c/${courseId}/a/${id}`,
    due: Option.fromNullable(due).map(({ date, time }) => ({
      utcDate: date,
      utcTime: Option.fromNullable(time),
    })),
  };
}

export const classroomFailure = <T>(code: ClassroomErrorCode) =>
  Result.fail<T, ClassroomError>({ code, message: code });

export interface SyncHarness {
  client: PortMock<IClassroomClient>;
  tokens: PortMock<IChildAccessTokens>;
  extractor: PortMock<IAnnouncementExtractor>;
  ingest: PortMock<IEventIngest>;
  state: PortMock<IChildSyncState>;
  ledger: PortMock<ISeenAnnouncementRepository>;
  outbox: PortMock<IOutboxRepository>;
  logger: PortMock<ILogger>;
  instrumentation: PortMock<IInstrumentation>;
  uow: UnitOfWorkMock;
  sleeps: number[];
  service: SyncChildService;
  recorded(): LedgerEntry[];
  givenCourses(courses: Record<string, Announcement[]>): void;
  givenCoursework(items: Coursework[], turnedIn?: string[]): void;
}

export function syncHarness(): SyncHarness {
  const client = mockPort<IClassroomClient>();
  const tokens = mockPort<IChildAccessTokens>();
  const extractor = mockPort<IAnnouncementExtractor>();
  const ingest = mockPort<IEventIngest>();
  const state = mockPort<IChildSyncState>();
  const ledger = mockPort<ISeenAnnouncementRepository>();
  const outbox = mockPort<IOutboxRepository>();
  const logger = mockPort<ILogger>();
  const instrumentation = mockInstrumentation();
  const uow = mockUnitOfWork();
  const sleeps: number[] = [];

  tokens.accessTokenFor.mockResolvedValue(Result.ok("ya29.child"));
  client.listCourses.mockResolvedValue(Result.ok<Course[], ClassroomError>([]));
  client.listAnnouncements.mockResolvedValue(Result.ok<Announcement[], ClassroomError>([]));
  client.listCoursework.mockResolvedValue(Result.ok<Coursework[], ClassroomError>([]));
  client.listTurnedIn.mockResolvedValue(Result.ok<string[], ClassroomError>([]));
  client.profileNames.mockResolvedValue(Result.ok<string[], ClassroomError>([]));
  extractor.extract.mockResolvedValue(Result.ok<ExtractedDeadline[], AppError>([]));
  ingest.ingest.mockImplementation(async ({ events }) =>
    Result.ok<{ created: number }, AppError>({ created: events.length }),
  );
  ingest.ingestCoursework.mockImplementation(async ({ items }) =>
    Result.ok<{ created: number }, AppError>({ created: items.length }),
  );
  ingest.withdrawCourseworkOutside.mockResolvedValue(
    Result.ok<{ withdrawn: number }, AppError>({ withdrawn: 0 }),
  );
  state.holdsLease.mockResolvedValue(Result.ok<boolean, AppError>(true));
  state.markSynced.mockResolvedValue(Result.ok<AppError>());
  state.markSyncFailed.mockResolvedValue(Result.ok<AppError>());
  state.markNeedsReconnect.mockResolvedValue(Result.ok<AppError>());
  ledger.findForCourse.mockResolvedValue(Result.ok<SeenAnnouncement[], SyncError>([]));
  ledger.record.mockResolvedValue(Result.ok<boolean, SyncError>(true));
  outbox.enqueue.mockResolvedValue(undefined);

  const reader = new ClassroomReader(client, ledger, instrumentation, async (ms) => {
    sleeps.push(ms);
  });
  const service = new SyncChildService(
    reader,
    tokens,
    extractor,
    ingest,
    state,
    ledger,
    uow.unitOfWork,
    outbox,
    instrumentation,
    logger,
  );

  return {
    client,
    tokens,
    extractor,
    ingest,
    state,
    ledger,
    outbox,
    logger,
    instrumentation,
    uow,
    sleeps,
    service,
    recorded: () => ledger.record.mock.calls.map(([entry]) => entry),
    givenCourses(courses) {
      client.listCourses.mockResolvedValue(
        Result.ok<Course[], ClassroomError>(Object.keys(courses).map((id) => ({ id }))),
      );
      client.listAnnouncements.mockImplementation(async (_token, courseId) =>
        Result.ok<Announcement[], ClassroomError>(courses[courseId] ?? []),
      );
    },
    givenCoursework(items, turnedIn = []) {
      client.listCoursework.mockImplementation(async (_token, courseId) =>
        Result.ok<Coursework[], ClassroomError>(items.filter((item) => item.courseId === courseId)),
      );
      client.listTurnedIn.mockResolvedValue(Result.ok<string[], ClassroomError>(turnedIn));
    },
  };
}
