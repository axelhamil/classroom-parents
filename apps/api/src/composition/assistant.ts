import type { AssistantSettings } from "@modules/assistant/application/config/ai-quotas";
import type {
  IOperatorAlerts,
  OperatorAlert,
} from "@modules/assistant/application/ports/operator-alerts.port";
import { assistantModule } from "@modules/assistant/assistant.module";
import {
  type AppError,
  type IInstrumentation,
  type IUnitOfWork,
  Option,
  Result,
} from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { container } from "inwire";
import type { env } from "../shared/env";
import type { Logger } from "../shared/logger";

interface AssistantHost {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  IEmailService: IEmailService;
}

type AssistantSource = Pick<typeof env, "AI_DAILY_SPEND_CAP_USD" | "AI_ALERT_EMAIL">;

/**
 * Alerts for the operator: always a structured warning in the logs, and an email through the
 * queue when `AI_ALERT_EMAIL` is set. The alert key is the email idempotency key.
 */
export function operatorAlertsFor(
  email: () => IEmailService,
  to: Option<string>,
  logger: Logger,
): IOperatorAlerts {
  return {
    notify: async (alert: OperatorAlert) => {
      logger.warn({ alert: alert.key, lines: alert.lines }, alert.subject);
      if (to.isNone()) return Result.ok();

      const sent = await email().sendRaw(
        to.unwrap(),
        alert.subject,
        { text: alert.lines.join("\n") },
        { idempotencyKey: `ai-alert:${alert.key}` },
      );
      return sent.mapError(
        (error): AppError => ({
          code: "AI_ALERT_PROVIDER_FAILURE",
          message: "the operator alert email could not be queued",
          cause: error,
        }),
      );
    },
  };
}

/**
 * The assistant composed in a container of its own, fed by the host's instrumentation, unit
 * of work, outbox and email queue. Why: the main container sits at the type instantiation
 * ceiling of inwire, one more key there fails `di.scope` with TS2589.
 */
export const assistantContainer = (host: AssistantHost, source: AssistantSource, logger: Logger) =>
  container()
    .add("IInstrumentation", () => host.IInstrumentation)
    .add("ITransactionService", () => host.ITransactionService)
    .add("IOutboxRepository", () => host.IOutboxRepository)
    .add(
      "IOperatorAlerts",
      (): IOperatorAlerts =>
        operatorAlertsFor(
          () => host.IEmailService,
          Option.fromNullable(source.AI_ALERT_EMAIL),
          logger,
        ),
    )
    .add(
      "assistantSettings",
      (): AssistantSettings => ({
        dailySpendCapMicroUsd: Math.round(source.AI_DAILY_SPEND_CAP_USD * 1_000_000),
      }),
    )
    .addModule(assistantModule)
    .build();
