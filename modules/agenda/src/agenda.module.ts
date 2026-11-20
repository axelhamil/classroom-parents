import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { IAlertPlanner } from "./application/ports/alert-planner.port";
import type { IChildOwnership } from "./application/ports/child-ownership.port";
import type { ICourseNames } from "./application/ports/course-names.port";
import type { IEventRepository } from "./application/ports/event-repository.port";
import type { IParentTimeZone } from "./application/ports/parent-time-zone.port";
import type { IVisibleChildren } from "./application/ports/visible-children.port";
import { AnnouncementReconciler } from "./application/services/announcement-reconciler";
import { EventEditService } from "./application/services/event-edit.service";
import { EventIngestService } from "./application/services/event-ingest.service";
import { EventPresenter } from "./application/services/event-presenter";
import { EventQueryService } from "./application/services/event-query.service";
import { EventRereadService } from "./application/services/event-reread.service";
import { DrizzleEventRepository } from "./infrastructure/repositories/drizzle-event.repository";

export interface AgendaPrerequisites {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  IAlertPlanner: IAlertPlanner;
  IChildOwnership: IChildOwnership;
  IVisibleChildren: IVisibleChildren;
  ICourseNames: ICourseNames;
  IParentTimeZone: IParentTimeZone;
}

export const agendaModule = defineModule<AgendaPrerequisites>()((b) =>
  b
    .add(
      "IEventRepository",
      (c): IEventRepository => new DrizzleEventRepository(c.IInstrumentation),
    )
    .add("EventPresenter", (c) => new EventPresenter(c.ICourseNames, c.IInstrumentation))
    .add(
      "AnnouncementReconciler",
      (c) => new AnnouncementReconciler(c.IEventRepository, c.IAlertPlanner, c.IOutboxRepository),
    )
    .add(
      "EventIngestService",
      (c) =>
        new EventIngestService(
          c.IEventRepository,
          c.IChildOwnership,
          c.IAlertPlanner,
          c.ITransactionService,
          c.IOutboxRepository,
          c.AnnouncementReconciler,
          c.IParentTimeZone,
          c.IInstrumentation,
        ),
    )
    .add(
      "EventRereadService",
      (c) =>
        new EventRereadService(
          c.IEventRepository,
          c.IChildOwnership,
          c.ITransactionService,
          c.IOutboxRepository,
          c.IInstrumentation,
        ),
    )
    .add(
      "EventEditService",
      (c) =>
        new EventEditService(
          c.IEventRepository,
          c.IVisibleChildren,
          c.IAlertPlanner,
          c.ITransactionService,
          c.IOutboxRepository,
          c.EventPresenter,
          c.AnnouncementReconciler,
          c.IParentTimeZone,
          c.IInstrumentation,
        ),
    )
    .add(
      "EventQueryService",
      (c) =>
        new EventQueryService(
          c.IEventRepository,
          c.IVisibleChildren,
          c.EventPresenter,
          c.IParentTimeZone,
          c.IInstrumentation,
        ),
    ),
);
