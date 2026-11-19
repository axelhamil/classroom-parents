import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { AssistantSettings } from "./application/config/ai-quotas";
import type { IAiSpendReader } from "./application/ports/ai-spend-reader.port";
import type { IAiUsageRepository } from "./application/ports/ai-usage-repository.port";
import type { IOperatorAlerts } from "./application/ports/operator-alerts.port";
import { AiQuotaService } from "./application/services/ai-quota.service";
import { AiUsageWatchService } from "./application/services/ai-usage-watch.service";
import { PreferenceService } from "./application/services/preference.service";
import { DrizzleAiSpendReader } from "./infrastructure/repositories/drizzle-ai-spend.reader";
import { DrizzleAiUsageRepository } from "./infrastructure/repositories/drizzle-ai-usage.repository";
import { DrizzleAiUsageAlertLog } from "./infrastructure/repositories/drizzle-ai-usage-alert.log";
import { DrizzlePreferenceRepository } from "./infrastructure/repositories/drizzle-preference.repository";

export interface AssistantPrerequisites {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  IOperatorAlerts: IOperatorAlerts;
  assistantSettings: AssistantSettings;
}

export const assistantModule = defineModule<AssistantPrerequisites>()((b) =>
  b
    .add(
      "IAiUsageRepository",
      (c): IAiUsageRepository => new DrizzleAiUsageRepository(c.IInstrumentation),
    )
    .add("IAiSpendReader", (c): IAiSpendReader => new DrizzleAiSpendReader(c.IInstrumentation))
    .add(
      "PreferenceService",
      (c) =>
        new PreferenceService(
          new DrizzlePreferenceRepository(c.IInstrumentation),
          c.ITransactionService,
          c.IOutboxRepository,
          c.IInstrumentation,
        ),
    )
    .add(
      "AiQuotaService",
      (c) =>
        new AiQuotaService(
          c.IAiUsageRepository,
          c.IAiSpendReader,
          c.ITransactionService,
          c.IOutboxRepository,
          c.IInstrumentation,
          c.assistantSettings,
        ),
    )
    .add(
      "AiUsageWatchService",
      (c) =>
        new AiUsageWatchService(
          c.IAiUsageRepository,
          c.IAiSpendReader,
          new DrizzleAiUsageAlertLog(c.IInstrumentation),
          c.IOperatorAlerts,
          c.ITransactionService,
          c.IInstrumentation,
          c.assistantSettings,
        ),
    ),
);
