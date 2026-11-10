import { describe, expect, it, mock } from "bun:test";
import type { ILogger } from "@packages/ddd-kit";
import { type ResendBatchClient, resendBatchSender } from "@packages/email/email-delivery-worker";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type { AlertEmailContent } from "../application/ports/alert-email-sender.port";
import { ResendAlertEmailSender } from "../infrastructure/adapters/resend-alert-email.sender";

const content: AlertEmailContent = {
  alertId: "0196a000-0000-7000-8000-0000000000a1",
  version: 2,
  eventTitle: "<img src=x onerror=alert(1)> Contrôle",
  childLabel: "Léa",
  deadlineLabel: "jeudi 19 novembre",
  eventUrl: "https://app.example.com/events/1",
};

type BatchAnswer = Awaited<ReturnType<ResendBatchClient["batch"]["send"]>>;
type ProviderError = Extract<BatchAnswer, { data: null }>["error"];

function senderAnswering(answer: BatchAnswer) {
  const send = mock(
    async (_entries: unknown, _options: { idempotencyKey?: string; signal: AbortSignal }) => answer,
  );
  const kit = resendBatchSender({ batch: { send } }, mockInstrumentation(), mockPort<ILogger>());
  return {
    send,
    sender: new ResendAlertEmailSender(kit, "alerts@example.com", mockInstrumentation()),
  };
}

function failingWith(error: ProviderError) {
  return senderAnswering({ data: null, error });
}

describe("ResendAlertEmailSender", () => {
  it("given an occurrence of an alert, then one escaped email goes straight to the provider through the email kit, under a key bound to that occurrence", async () => {
    const { send, sender } = senderAnswering({ data: { data: [{ id: "e1" }] }, error: null });

    const result = await sender.send("parent@example.com", content);

    expect(result.isSuccess).toBe(true);
    const [entries, options] = send.mock.calls[0] ?? [];
    expect(entries).toEqual([
      expect.objectContaining({
        from: "alerts@example.com",
        to: "parent@example.com",
        html: expect.stringContaining("&lt;img src=x onerror=alert(1)&gt; Contrôle"),
      }),
    ]);
    expect(entries).toEqual([
      expect.objectContaining({ html: expect.not.stringContaining("<img") }),
    ]);
    expect(options?.idempotencyKey).toBe(`alert-${content.alertId}-v2`);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("given the provider fails for a while, then ALERT_PROVIDER_FAILURE so the dispatcher retries", async () => {
    const { sender } = failingWith({
      name: "internal_server_error",
      message: "down",
      statusCode: 500,
    });

    const result = await sender.send("parent@example.com", content);

    expect(result.getError().code).toBe("ALERT_PROVIDER_FAILURE");
  });

  it("given the provider rejects the email for good, then ALERT_EMAIL_INVALID so the dispatcher stops retrying", async () => {
    const { sender } = failingWith({
      name: "validation_error",
      message: "invalid to",
      statusCode: 422,
    });

    const result = await sender.send("parent@example.com", content);

    expect(result.getError().code).toBe("ALERT_EMAIL_INVALID");
  });

  it("given the provider refuses this one email of the batch, then ALERT_EMAIL_INVALID", async () => {
    const { sender } = senderAnswering({
      data: { data: [], errors: [{ index: 0, message: "invalid to" }] },
      error: null,
    });

    const result = await sender.send("parent@example.com", content);

    expect(result.getError().code).toBe("ALERT_EMAIL_INVALID");
  });

  it("given the provider already holds an email under this occurrence's key, then the email counts as sent", async () => {
    const { sender } = failingWith({
      name: "invalid_idempotent_request",
      message: "same key, different payload",
      statusCode: 409,
    });

    const result = await sender.send("parent@example.com", content);

    expect(result.isSuccess).toBe(true);
  });
});
