import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
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

export class ResendAlertEmailSender implements IAlertEmailSender {
  constructor(
    private readonly sender: BatchSender,
    private readonly from: string,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async send(to: string, content: AlertEmailContent): Promise<Result<void, AlertsError>> {
    return this.instrumentation.startSpan({ name: "ResendAlertEmailSender > send" }, async () => {
      const idempotencyKey = `alert-${content.alertId}-v${content.version}`;
      const result = await this.sender.batchSend(
        [{ from: this.from, to, ...alertEmail(content) }],
        Option.some(idempotencyKey),
      );
      const refused = result.errors?.[0];
      if (refused) return Result.fail(emailFailure("ALERT_EMAIL_INVALID", refused.message));
      if (!result.error || result.error.kind === "conflict") return Result.ok();
      if (result.error.kind === "rejected")
        return Result.fail(emailFailure("ALERT_EMAIL_INVALID", result.error.message));

      return Result.fail(emailFailure("ALERT_PROVIDER_FAILURE", result.error.message));
    });
  }
}

function emailFailure(
  code: "ALERT_EMAIL_INVALID" | "ALERT_PROVIDER_FAILURE",
  reason: string,
): AlertsError {
  return {
    code,
    message: `alert email not sent: ${reason}`,
    metadata: { emailCode: reason },
  };
}
