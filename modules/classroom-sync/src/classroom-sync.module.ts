import type { IInstrumentation, ILogger, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import { onChildConnected } from "./application/event-handlers/on-child-connected";
import type { IAnnouncementExtractor } from "./application/ports/announcement-extractor.port";
import type { IChildAccessTokens } from "./application/ports/child-access-tokens.port";
import type { IChildSyncState } from "./application/ports/child-sync-state.port";
import type { IClassroomClient } from "./application/ports/classroom-client.port";
import type { IClassroomReader } from "./application/ports/classroom-reader.port";
import type { IDueChildren } from "./application/ports/due-children.port";
import type { IEventIngest } from "./application/ports/event-ingest.port";
import type { IManualSyncGate } from "./application/ports/manual-sync-gate.port";
import type { ISeenAnnouncementRepository } from "./application/ports/seen-announcement-repository.port";
import type { IUpcomingAlerts } from "./application/ports/upcoming-alerts.port";
import { ClassroomReader } from "./application/services/classroom-reader.service";
import { ManualSyncService } from "./application/services/manual-sync.service";
import { SyncChildService } from "./application/services/sync-child.service";
import { SyncDueChildrenService } from "./application/services/sync-due-children.service";
import { GoogleClassroomClient } from "./infrastructure/adapters/google-classroom.client";
import { DrizzleSeenAnnouncementRepository } from "./infrastructure/repositories/drizzle-seen-announcement.repository";

export interface ClassroomSyncPrerequisites {
  IInstrumentation: IInstrumentation;
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
      "IClassroomReader",
      (c): IClassroomReader =>
        new ClassroomReader(c.IClassroomClient, c.ISeenAnnouncementRepository, c.IInstrumentation),
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
      (c) => new ManualSyncService(c.IManualSyncGate, c.SyncChildService, c.IInstrumentation),
    )
    .add("onChildConnected", (c) => onChildConnected(c)),
);
