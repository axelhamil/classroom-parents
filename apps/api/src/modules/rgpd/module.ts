import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import { logger } from "../../shared/logger";
import type { RgpdSettings } from "./application/config/rgpd-settings";
import type { IChildConnections } from "./application/ports/child-connections.port";
import type { IRgpdRepository } from "./application/ports/rgpd.port";
import type { IUserDataReader } from "./application/ports/user-data-reader.port";
import { DataExportService } from "./application/services/data-export.service";
import { RgpdService } from "./application/services/rgpd.service";
import { DrizzleRgpdRepository } from "./infrastructure/repositories/drizzle-rgpd.repository";

export interface RgpdPrerequisites {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  IEmailService: IEmailService;
  IChildConnections: IChildConnections;
  IUserDataReader: IUserDataReader;
  rgpdSettings: RgpdSettings;
}

export const rgpdModule = defineModule<RgpdPrerequisites>()((b) =>
  b
    .add(
      "IRgpdRepository",
      (c): IRgpdRepository => new DrizzleRgpdRepository(logger, c.IInstrumentation),
    )
    .add(
      "RgpdService",
      (c) =>
        new RgpdService(
          c.IRgpdRepository,
          c.IChildConnections,
          c.IEmailService,
          c.ITransactionService,
          c.IOutboxRepository,
          c.IInstrumentation,
          c.rgpdSettings,
          logger,
        ),
    )
    .add(
      "DataExportService",
      (c) =>
        new DataExportService(
          c.IRgpdRepository,
          c.IUserDataReader,
          c.ITransactionService,
          c.IOutboxRepository,
          c.IInstrumentation,
        ),
    ),
);
