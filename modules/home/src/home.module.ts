import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import { HomeService } from "./application/services/home.service";
import { DrizzleHomeRepository } from "./infrastructure/repositories/drizzle-home.repository";

export interface HomePrerequisites {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
}

export const homeModule = defineModule<HomePrerequisites>()((b) =>
  b.add(
    "HomeService",
    (c) =>
      new HomeService(
        new DrizzleHomeRepository(c.IInstrumentation),
        c.ITransactionService,
        c.IOutboxRepository,
        c.IInstrumentation,
      ),
  ),
);
