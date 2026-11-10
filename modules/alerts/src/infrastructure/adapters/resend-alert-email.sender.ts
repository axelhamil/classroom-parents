import { type IInstrumentation, type ILogger, Option, Result } from "@packages/ddd-kit";
import type { BatchSender } from "@packages/email/email-delivery-worker";
import type {
  AlertEmailContent,
  IAlertEmailSender,
} from "../../application/ports/alert-email-sender.port";
import type { AlertsError } from "../../application/ports/alert-repository.port";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

function alertEmail(content: AlertEmailContent) {
  const subject = `Rappel : ${content.eventTitle} (${content.childLabel})`;
  const text = [
    `${content.childLabel} a une échéance ${content.deadlineLabel} :`,
    content.eventTitle,
    "",
    `Voir l'échéance : ${content.eventUrl}`,
  ].join("\n");
  const html = [
    `<p>${escapeHtml(content.childLabel)} a une échéance ${escapeHtml(content.deadlineLabel)} :</p>`,
    `<p><strong>${escapeHtml(content.eventTitle)}</strong></p>`,
    `<p><a href="${escapeHtml(content.eventUrl)}">Voir l'échéance</a></p>`,
  ].join("\n");

  return { subject, text, html };
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
  ) {}

  async send(to: string, content: AlertEmailContent): Promise<Result<void, AlertsError>> {
    return this.instrumentation.startSpan({ name: "ResendAlertEmailSender > send" }, async () => {
      const idempotencyKey = `alert-${content.alertId}-v${content.version}`;
      const result = await this.sender.batchSend(
        [{ from: this.from, to, ...alertEmail(content) }],
        Option.some(idempotencyKey),
      );
      const refused = result.errors?.[0];
      if (refused) return this.refused(content, { statusCode: 422, message: refused.message });
      if (!result.error || result.error.kind === "conflict") return Result.ok();
      if (result.error.kind === "rejected") return this.refused(content, result.error);

      return Result.fail(emailFailure("ALERT_PROVIDER_FAILURE", result.error.message));
    });
  }

  private refused(
    content: AlertEmailContent,
    error: { statusCode: number; message: string },
  ): Result<void, AlertsError> {
    if (RECIPIENT_FIELD.test(error.message))
      return Result.fail(emailFailure("ALERT_EMAIL_INVALID", error.message));

    this.instrumentation.capture(
      new Error(`alert email refused by the provider: ${error.statusCode}`),
    );
    this.logger.error(
      {
        alertId: content.alertId,
        version: content.version,
        statusCode: error.statusCode,
        reason: error.message,
      },
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
