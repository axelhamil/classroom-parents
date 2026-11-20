import type { IEventSummaries } from "@modules/notifications/application/ports/event-summaries.port";
import { notificationsModule } from "@modules/notifications/notifications.module";
import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { container } from "inwire";
import { NotificationEventsQuery } from "../queries/notification-events.query";

interface NotificationsHost {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
}

/**
 * The notification center composed in a container of its own, fed by the host's
 * instrumentation, unit of work and outbox; its event handlers join the outbox relay through
 * the delivery module's handler source. Why: the main container sits at the type
 * instantiation ceiling of inwire, one more key there fails `di.scope` with TS2589.
 */
export const notificationsContainer = (host: NotificationsHost) =>
  container()
    .add("IInstrumentation", () => host.IInstrumentation)
    .add("ITransactionService", () => host.ITransactionService)
    .add("IOutboxRepository", () => host.IOutboxRepository)
    .add("IEventSummaries", (c): IEventSummaries => new NotificationEventsQuery(c.IInstrumentation))
    .addModule(notificationsModule)
    .build();
