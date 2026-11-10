import { type IInstrumentation, Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
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

  return { subject, body: { text, html } };
}

export class ResendAlertEmailSender implements IAlertEmailSender {
  constructor(
    private readonly emails: IEmailService,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async send(to: string, content: AlertEmailContent): Promise<Result<void, AlertsError>> {
    return this.instrumentation.startSpan({ name: "ResendAlertEmailSender > send" }, async () => {
      const { subject, body } = alertEmail(content);
      const sent = await this.emails.sendRaw(to, subject, body, {
        idempotencyKey: `alert-${content.alertId}`,
      });
      if (sent.isSuccess) return Result.ok();

      return Result.fail({
        code: "ALERT_PROVIDER_FAILURE",
        message: `alert email not sent: ${sent.getError().code}`,
        metadata: { emailCode: sent.getError().code },
      });
    });
  }
}
