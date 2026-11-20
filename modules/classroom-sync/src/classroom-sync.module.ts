import type { IBackgroundWork, IInstrumentation, ILogger, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import { onChildConnected } from "./application/event-handlers/on-child-connected";
import { onExtractionResumed } from "./application/event-handlers/on-extraction-resumed";
import type { IAnnouncementExtractor } from "./application/ports/announcement-extractor.port";
import type { IChildAccessTokens } from "./application/ports/child-access-tokens.port";
import type { IChildSyncState } from "./application/ports/child-sync-state.port";
import type { IClassroomClient } from "./application/ports/classroom-client.port";
import type { IClassroomReader } from "./application/ports/classroom-reader.port";
import type { ICourseRepository } from "./application/ports/course-repository.port";
import type { IDueChildren } from "./application/ports/due-children.port";
import type { IEventIngest } from "./application/ports/event-ingest.port";
import type { IManualSyncGate } from "./application/ports/manual-sync-gate.port";
import type { IParentChildren } from "./application/ports/parent-children.port";
import type { IParentTimeZone } from "./application/ports/parent-time-zone.port";
import type { ISeenAnnouncementRepository } from "./application/ports/seen-announcement-repository.port";
import type { IUpcomingAlerts } from "./application/ports/upcoming-alerts.port";
import type { IWrittenDates } from "./application/ports/written-dates.port";
import { ClassroomReader } from "./application/services/classroom-reader.service";
import { CourseNamesService } from "./application/services/course-names.service";
import { ManualSyncService } from "./application/services/manual-sync.service";
import { RereadAnnouncementsService } from "./application/services/reread-announcements.service";
import { SyncChildService } from "./application/services/sync-child.service";
import { SyncDueChildrenService } from "./application/services/sync-due-children.service";
import { GoogleClassroomClient } from "./infrastructure/adapters/google-classroom.client";
import { DrizzleCourseRepository } from "./infrastructure/repositories/drizzle-course.repository";
import { DrizzleSeenAnnouncementRepository } from "./infrastructure/repositories/drizzle-seen-announcement.repository";

export interface ClassroomSyncPrerequisites {
  IInstrumentation: IInstrumentation;
  IBackgroundWork: IBackgroundWork;
  ILogger: ILogger;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  IChildAccessTokens: IChildAccessTokens;
  IAnnouncementExtractor: IAnnouncementExtractor;
  IEventIngest: IEventIngest;
  IDueChildren: IDueChildren;
  IChildSyncState: IChildSyncState;
  IManualSyncGate: IManualSyncGate;
  IUpcomingAlerts: IUpcomingAlerts;
  IParentChildren: IParentChildren;
  IParentTimeZone: IParentTimeZone;
  IWrittenDates: IWrittenDates;
}

export const classroomSyncModule = defineModule<ClassroomSyncPrerequisites>()((b) =>
  b
    .add(
      "IClassroomClient",
      (c): IClassroomClient => new GoogleClassroomClient(c.IInstrumentation, fetch),
    )
    .add(
      "ISeenAnnouncementRepository",
      (c): ISeenAnnouncementRepository => new DrizzleSeenAnnouncementRepository(c.IInstrumentation),
    )
    .add(
      "ICourseRepository",
      (c): ICourseRepository => new DrizzleCourseRepository(c.IInstrumentation),
    )
    .add("CourseNamesService", (c) => new CourseNamesService(c.ICourseRepository))
    .add(
      "IClassroomReader",
      (c): IClassroomReader =>
        new ClassroomReader(
          c.IClassroomClient,
          c.ISeenAnnouncementRepository,
          c.IWrittenDates,
          c.IInstrumentation,
        ),
    )
    .add(
      "SyncChildService",
      (c) =>
        new SyncChildService(
          c.IClassroomReader,
          c.IChildAccessTokens,
          c.IAnnouncementExtractor,
          c.IEventIngest,
          c.IUpcomingAlerts,
          c.IChildSyncState,
          c.ISeenAnnouncementRepository,
          c.ICourseRepository,
          c.IParentTimeZone,
          c.ITransactionService,
          c.IOutboxRepository,
          c.IInstrumentation,
          c.ILogger,
        ),
    )
    .add(
      "SyncDueChildrenService",
      (c) => new SyncDueChildrenService(c.IDueChildren, c.SyncChildService, c.IInstrumentation),
    )
    .add(
      "ManualSyncService",
      (c) =>
        new ManualSyncService(
          c.IManualSyncGate,
          c.SyncChildService,
          c.IBackgroundWork,
          c.IInstrumentation,
        ),
    )
    .add(
      "RereadAnnouncementsService",
      (c) =>
        new RereadAnnouncementsService(
          c.IParentChildren,
          c.IChildAccessTokens,
          c.IClassroomReader,
          c.ISeenAnnouncementRepository,
          c.IAnnouncementExtractor,
          c.IEventIngest,
          c.IInstrumentation,
        ),
    )
    .add("onChildConnected", (c) => onChildConnected(c))
    .add("onExtractionResumed", (c) => onExtractionResumed(c)),
);
