import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { IAlertPlanner } from "./application/ports/alert-planner.port";
import type { IChildOwnership } from "./application/ports/child-ownership.port";
import type { IEventRepository } from "./application/ports/event-repository.port";
import type { IVisibleChildren } from "./application/ports/visible-children.port";
import { EventEditService } from "./application/services/event-edit.service";
import { EventIngestService } from "./application/services/event-ingest.service";
import { EventQueryService } from "./application/services/event-query.service";
import { DrizzleEventRepository } from "./infrastructure/repositories/drizzle-event.repository";

export interface AgendaPrerequisites {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  IAlertPlanner: IAlertPlanner;
  IChildOwnership: IChildOwnership;
  IVisibleChildren: IVisibleChildren;
}

export const agendaModule = defineModule<AgendaPrerequisites>()((b) =>
  b
    .add(
      "IEventRepository",
      (c): IEventRepository => new DrizzleEventRepository(c.IInstrumentation),
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
          c.IInstrumentation,
        ),
    )
    .add(
      "EventQueryService",
      (c) => new EventQueryService(c.IEventRepository, c.IVisibleChildren, c.IInstrumentation),
    ),
);
