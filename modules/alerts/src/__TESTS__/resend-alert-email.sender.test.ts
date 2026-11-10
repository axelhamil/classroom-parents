import { describe, expect, it, mock } from "bun:test";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type { AlertEmailContent } from "../application/ports/alert-email-sender.port";
import {
  type AlertMailClient,
  type AlertMailError,
  ResendAlertEmailSender,
} from "../infrastructure/adapters/resend-alert-email.sender";

const content: AlertEmailContent = {
  alertId: "0196a000-0000-7000-8000-0000000000a1",
  version: 2,
  eventTitle: "<img src=x onerror=alert(1)> Contrôle",
  childLabel: "Léa",
  deadlineLabel: "jeudi 19 novembre",
  eventUrl: "https://app.example.com/events/1",
};

function clientAnswering(error: AlertMailError | null) {
  const send = mock<AlertMailClient["emails"]["send"]>(async () => ({ error }));
  return { send, client: { emails: { send } } };
}

describe("ResendAlertEmailSender", () => {
  it("given an occurrence of an alert, then the email goes straight to the provider, escaped, under a key bound to that occurrence", async () => {
    const { send, client } = clientAnswering(null);

    const result = await new ResendAlertEmailSender(
      client,
      "alerts@example.com",
      mockInstrumentation(),
    ).send("parent@example.com", content);

    expect(result.isSuccess).toBe(true);
    const [payload, options] = send.mock.calls[0] ?? [];
    expect(payload).toMatchObject({ from: "alerts@example.com", to: "parent@example.com" });
    expect(payload?.html).toContain("&lt;img src=x onerror=alert(1)&gt; Contrôle");
    expect(payload?.html).not.toContain("<img");
    expect(options?.idempotencyKey).toBe(`alert-${content.alertId}-v2`);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("given the provider fails, then ALERT_PROVIDER_FAILURE so the dispatcher counts a failure", async () => {
    const { client } = clientAnswering({
      name: "internal_server_error",
      message: "down",
      statusCode: 500,
    });

    const result = await new ResendAlertEmailSender(
      client,
      "alerts@example.com",
      mockInstrumentation(),
    ).send("parent@example.com", content);

    expect(result.getError().code).toBe("ALERT_PROVIDER_FAILURE");
  });

  it("given the provider already holds this occurrence's key, then the email counts as sent", async () => {
    const { client } = clientAnswering({
      name: "invalid_idempotent_request",
      message: "same key, different payload",
      statusCode: 409,
    });

    const result = await new ResendAlertEmailSender(
      client,
      "alerts@example.com",
      mockInstrumentation(),
    ).send("parent@example.com", content);

    expect(result.isSuccess).toBe(true);
  });
});
