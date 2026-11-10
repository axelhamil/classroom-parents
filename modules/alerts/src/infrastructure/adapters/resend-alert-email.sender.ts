import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { SEND_TIMEOUT_MS } from "../../application/config/dispatch-budget";
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

export interface AlertMailError {
  name: string;
  message: string;
  statusCode: number | null;
}

export interface AlertMailClient {
  emails: {
    send(
      payload: { from: string; to: string; subject: string; text: string; html: string },
      options: { idempotencyKey: string; signal: AbortSignal },
    ): Promise<{ error: AlertMailError | null }>;
  };
}

const ALREADY_SENT = "invalid_idempotent_request";

export class ResendAlertEmailSender implements IAlertEmailSender {
  constructor(
    private readonly client: AlertMailClient | null,
    private readonly from: string,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async send(to: string, content: AlertEmailContent): Promise<Result<void, AlertsError>> {
    return this.instrumentation.startSpan({ name: "ResendAlertEmailSender > send" }, async () => {
      if (!this.client) {
        this.instrumentation.addBreadcrumb({ message: "alert email not delivered: no API key" });
        return Result.ok();
      }

      const client = this.client;
      const idempotencyKey = `alert-${content.alertId}-v${content.version}`;
      try {
        const { error } = await this.instrumentation.startSpan(
          {
            name: "POST https://api.resend.com/emails",
            op: "http.client",
            attributes: { "http.method": "POST", "server.address": "api.resend.com" },
          },
          () =>
            client.emails.send(
              { from: this.from, to, ...alertEmail(content) },
              { idempotencyKey, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) },
            ),
        );
        if (!error || error.name === ALREADY_SENT) return Result.ok();

        return Result.fail(providerFailure(`${error.name} ${error.statusCode ?? ""}`.trim()));
      } catch (err) {
        const reason = err instanceof Error ? err.name : "network";
        this.instrumentation.capture(new Error(`alert email failed: ${reason}`));
        return Result.fail(providerFailure(reason));
      }
    });
  }
}

function providerFailure(reason: string): AlertsError {
  return {
    code: "ALERT_PROVIDER_FAILURE",
    message: `alert email not sent: ${reason}`,
    metadata: { emailCode: reason },
  };
}
