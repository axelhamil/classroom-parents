import type { HomeService } from "@modules/home/application/services/home.service";
import { homeModule } from "@modules/home/home.module";
import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { container } from "inwire";

interface HomeHost {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
}

export interface HomeContainer {
  HomeService: HomeService;
}

/**
 * The home screen preferences composed in a container of its own, fed by the host's
 * instrumentation, unit of work and outbox. Why: the main container sits at the type
 * instantiation ceiling of inwire, one more key there fails `di.scope` with TS2589.
 */
export const homeContainer = (host: HomeHost): HomeContainer =>
  container()
    .add("IInstrumentation", () => host.IInstrumentation)
    .add("ITransactionService", () => host.ITransactionService)
    .add("IOutboxRepository", () => host.IOutboxRepository)
    .addModule(homeModule)
    .build();
