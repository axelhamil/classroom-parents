import { describe, expect, it, mock } from "bun:test";
import { type ILogger, Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { type ResendBatchClient, resendBatchSender } from "@packages/email/email-delivery-worker";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type { AlertEmailContent } from "../application/ports/alert-email-sender.port";
import { I18nPushCopy } from "../infrastructure/adapters/i18n-push.copy";
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

function senderOver(client: ResendBatchClient | null) {
  const instrumentation = mockInstrumentation();
  const logger = mockPort<ILogger>();
  const kit = resendBatchSender(client, instrumentation, logger);
  return {
    instrumentation,
    logger,
    sender: new ResendAlertEmailSender(
      kit,
      "alerts@example.com",
      instrumentation,
      logger,
      mockPort<IEmailService>(),
    ),
  };
}

function senderAnswering(answer: BatchAnswer) {
  const send = mock(
    async (_entries: unknown, _options: { idempotencyKey?: string; signal: AbortSignal }) => answer,
  );
  return { send, ...senderOver({ batch: { send } }) };
}

function failingWith(error: ProviderError) {
  return senderAnswering({ data: null, error });
}

const INVALID_TO =
  "Invalid `to` field. The email address needs to follow the `email@example.com` or `Name <email@example.com>` format.";

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

  it("given an occurrence of an alert, then the email uses the shared layout and the catalog copy, in html and text", async () => {
    const { send, sender } = senderAnswering({ data: { data: [{ id: "e1" }] }, error: null });

    await sender.send("parent@example.com", content);

    const [entries] = send.mock.calls[0] ?? [];
    expect(entries).toEqual([
      expect.objectContaining({
        subject: "Rappel : <img src=x onerror=alert(1)> Contrôle (Léa)",
        html: expect.stringContaining('href="https://app.example.com/events/1"'),
        text: expect.stringContaining("Si vous n'attendiez pas cet e-mail"),
      }),
    ]);
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

  it("given the provider refuses the parent's address, then ALERT_EMAIL_INVALID so the dispatcher stops retrying", async () => {
    const { sender } = failingWith({
      name: "validation_error",
      message: INVALID_TO,
      statusCode: 422,
    });

    const result = await sender.send("parent@example.com", content);

    expect(result.getError().code).toBe("ALERT_EMAIL_INVALID");
  });

  it("given the provider refuses the parent's address inside the batch, then ALERT_EMAIL_INVALID", async () => {
    const { sender } = senderAnswering({
      data: { data: [], errors: [{ index: 0, message: INVALID_TO }] },
      error: null,
    });

    const result = await sender.send("parent@example.com", content);

    expect(result.getError().code).toBe("ALERT_EMAIL_INVALID");
  });

  it.each<[string, ProviderError]>([
    ["a refused key", { name: "invalid_api_key", message: "API key is invalid", statusCode: 403 }],
    ["a missing key", { name: "missing_api_key", message: "Missing API key", statusCode: 401 }],
    [
      "an unverified domain",
      {
        name: "validation_error",
        message: "The example.com domain is not verified. Please, add and verify your domain.",
        statusCode: 403,
      },
    ],
    [
      "an invalid sender",
      {
        name: "invalid_from_address",
        message:
          "Invalid `from` field. The email address needs to follow the `email@example.com` format.",
        statusCode: 422,
      },
    ],
  ])(
    "given %s on our side, then ALERT_EMAIL_UNAVAILABLE so the alert is retried, captured and logged for the operator",
    async (_case, error) => {
      const { sender, instrumentation, logger } = failingWith(error);

      const result = await sender.send("parent@example.com", content);

      expect(result.getError().code).toBe("ALERT_EMAIL_UNAVAILABLE");
      expect(instrumentation.capture).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          alertId: content.alertId,
          version: 2,
          statusCode: error.statusCode,
        }),
        expect.any(String),
      );
      expect(JSON.stringify(logger.error.mock.calls)).not.toContain("parent@example.com");
    },
  );

  it("given no Resend key in development, then the email counts as sent and the log names only ids, never the parent's address nor the child", async () => {
    const { sender, logger } = senderOver(null);

    const result = await sender.send("parent@example.com", content);

    expect(result.isSuccess).toBe(true);
    const logged = JSON.stringify(logger.info.mock.calls);
    expect(logged).toContain(`alert-${content.alertId}-v2`);
    expect(logged).not.toContain("parent@example.com");
    expect(logged).not.toContain("Léa");
    expect(logged).not.toContain("Contrôle");
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

describe("grouped email", () => {
  it("given deadlines of two children, then each line of the email reads like the line of the grouped push", async () => {
    const queue = mockPort<IEmailService>();
    queue.sendTemplate.mockResolvedValue(Result.ok());
    const sender = new ResendAlertEmailSender(
      resendBatchSender(null, mockInstrumentation(), mockPort<ILogger>()),
      "alerts@example.com",
      mockInstrumentation(),
      mockPort<ILogger>(),
      queue,
    );
    const items = [
      { eventTitle: "Devoir 1", childLabel: "Léa", deadlineLabel: "lundi 16 novembre, 8 h" },
      { eventTitle: "Devoir 2", childLabel: "Hugo", deadlineLabel: "lundi 16 novembre, 8 h" },
    ];

    await sender.sendGroup("parent@example.com", {
      groupKey: "alerts-key",
      items,
      appUrl: "https://app.example.com/",
    });

    const pushed = await new I18nPushCopy().forAlerts(
      items.map((item, n) => ({ ...item, alertId: `a${n}`, email: "", eventUrl: "" })),
      { details: true },
    );
    expect(queue.sendTemplate.mock.calls[0]?.[2].items).toBe(pushed.body);
  });
});
