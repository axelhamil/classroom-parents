import { type IInstrumentation, type ILogger, Option, Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import type { BatchSender } from "@packages/email/email-delivery-worker";
import { type RenderedEmail, renderTemplate } from "@packages/emails";
import type {
  AlertEmailContent,
  AlertGroupEmailContent,
  DigestEmailContent,
  IAlertEmailSender,
} from "../../application/ports/alert-email-sender.port";
import type { AlertsError } from "../../application/ports/alert-repository.port";
import { alertLines } from "./alert-lines";

function alertEmail(content: AlertEmailContent) {
  return renderTemplate("alert_reminder", {
    childLabel: content.childLabel,
    eventTitle: content.eventTitle,
    deadlineLabel: content.deadlineLabel,
    eventUrl: content.eventUrl,
  });
}

function digestEmail(content: DigestEmailContent) {
  return renderTemplate("weekly_digest", { summary: content.summary, appUrl: content.appUrl });
}

const RECIPIENT_FIELD = /`to`|recipient/i;

type EmailFailureCode =
  | "ALERT_EMAIL_INVALID"
  | "ALERT_EMAIL_UNAVAILABLE"
  | "ALERT_PROVIDER_FAILURE";

export class ResendAlertEmailSender implements IAlertEmailSender {
  constructor(
    private readonly sender: BatchSender,
    private readonly from: string,
    private readonly instrumentation: IInstrumentation,
    private readonly logger: ILogger,
    private readonly queue: IEmailService,
  ) {}

  async send(to: string, content: AlertEmailContent): Promise<Result<void, AlertsError>> {
    return this.instrumentation.startSpan({ name: "ResendAlertEmailSender > send" }, async () =>
      this.deliver(to, await alertEmail(content), `alert-${content.alertId}-v${content.version}`, {
        alertId: content.alertId,
        version: content.version,
      }),
    );
  }

  async sendGroup(
    to: string,
    { groupKey, items, appUrl }: AlertGroupEmailContent,
  ): Promise<Result<void, AlertsError>> {
    return this.instrumentation.startSpan(
      { name: "ResendAlertEmailSender > sendGroup" },
      async () => {
        const lines = await alertLines(items, { withChild: true });
        const queued = await this.queue.sendTemplate(
          "alert_group",
          to,
          { itemCount: String(items.length), items: lines.join("\n"), appUrl },
          { idempotencyKey: groupKey },
        );
        if (queued.isFailure && queued.getError().code !== "EMAIL_ALREADY_QUEUED")
          return Result.fail(emailFailure("ALERT_PROVIDER_FAILURE", queued.getError().message));

        return Result.ok();
      },
    );
  }

  async sendDigest(to: string, content: DigestEmailContent): Promise<Result<void, AlertsError>> {
    return this.instrumentation.startSpan(
      { name: "ResendAlertEmailSender > sendDigest" },
      async () =>
        this.deliver(to, await digestEmail(content), `digest-${content.digestId}`, {
          digestId: content.digestId,
        }),
    );
  }

  private async deliver(
    to: string,
    email: RenderedEmail,
    idempotencyKey: string,
    subject: Record<string, string | number>,
  ): Promise<Result<void, AlertsError>> {
    const result = await this.sender.batchSend(
      [{ from: this.from, to, ...email }],
      Option.some(idempotencyKey),
    );
    const refused = result.errors?.[0];
    if (refused) return this.refused(subject, { statusCode: 422, message: refused.message });
    if (!result.error || result.error.kind === "conflict") return Result.ok();
    if (result.error.kind === "rejected") return this.refused(subject, result.error);

    return Result.fail(emailFailure("ALERT_PROVIDER_FAILURE", result.error.message));
  }

  private refused(
    subject: Record<string, string | number>,
    error: { statusCode: number; message: string },
  ): Result<void, AlertsError> {
    if (RECIPIENT_FIELD.test(error.message))
      return Result.fail(emailFailure("ALERT_EMAIL_INVALID", error.message));

    this.instrumentation.capture(
      new Error(`alert email refused by the provider: ${error.statusCode}`),
    );
    this.logger.error(
      { ...subject, statusCode: error.statusCode, reason: error.message },
      "alert email refused by the provider configuration, check RESEND_API_KEY and RESEND_FROM",
    );
    return Result.fail(emailFailure("ALERT_EMAIL_UNAVAILABLE", error.message));
  }
}

function emailFailure(code: EmailFailureCode, reason: string): AlertsError {
  return {
    code,
    message: `alert email not sent: ${reason}`,
    metadata: { emailCode: reason },
  };
}
