import { describe, expect, it, mock } from "bun:test";
import { createECDH, randomBytes } from "node:crypto";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import {
  generateRequestDetails,
  generateVAPIDKeys,
  type PushSubscription,
  type RequestOptions,
  WebPushError,
} from "web-push";
import { SEND_TIMEOUT_MS } from "../application/config/dispatch-budget";
import type { PushPayload } from "../application/ports/push-sender.port";
import { WebPushSender } from "../infrastructure/adapters/web-push.sender";

const vapid = generateVAPIDKeys();
const settings = {
  vapidPublicKey: vapid.publicKey,
  vapidPrivateKey: vapid.privateKey,
  vapidSubject: "mailto:alerts@example.com",
};

function browserKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();

  return {
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  };
}

const target = { endpoint: "https://push.example.com/send/abc", ...browserKeys() };
const payload: PushPayload = {
  web_push: 8030,
  notification: {
    title: "Contrôle de maths",
    body: "Léa, échéance dimanche 15 novembre",
    navigate: "https://app.example.com/events/1",
  },
};
const options = {
  urgency: "high" as const,
  ttlSeconds: 7200,
  topic: "0196a0000000700080000000000000a1",
};

function senderFailingWith(statusCode: number, instrumentation = mockInstrumentation()) {
  const send = mock(async () => {
    throw new WebPushError(
      "Received unexpected response code",
      statusCode,
      {},
      "",
      target.endpoint,
    );
  });
  return { send, sender: new WebPushSender(instrumentation, settings, send) };
}

describe("WebPushSender", () => {
  it.each([410, 404])("given the push service answers %d, then PUSH_GONE", async (status) => {
    const { sender } = senderFailingWith(status);

    const result = await sender.send(target, payload, options);

    expect(result.getError()).toBe("PUSH_GONE");
  });

  it("given the push service answers 500, then PUSH_FAILED", async () => {
    const { sender } = senderFailingWith(500);

    const result = await sender.send(target, payload, options);

    expect(result.getError()).toBe("PUSH_FAILED");
  });

  it("given the push service answers 429, then the captured error names the status and the service host, never the device endpoint", async () => {
    const instrumentation = mockInstrumentation();
    const { sender } = senderFailingWith(429, instrumentation);

    await sender.send(target, payload, options);

    const captured = instrumentation.capture.mock.calls[0]?.[0];
    expect(captured).toBeInstanceOf(Error);
    expect(captured).not.toBeInstanceOf(WebPushError);
    expect(String(captured)).toContain("429 push.example.com");
    expect(JSON.stringify(captured)).not.toContain("/send/abc");
    expect(String(captured)).not.toContain("/send/abc");
  });

  it("given a delivery, then the declarative payload and the high urgency, 2 h TTL and topic reach the library", async () => {
    const send = mock(
      async (_subscription: PushSubscription, _body: string, _options: RequestOptions) => ({
        statusCode: 201,
      }),
    );
    const sender = new WebPushSender(mockInstrumentation(), settings, send);

    const result = await sender.send(target, payload, options);

    expect(result.isSuccess).toBe(true);
    const [subscription, body, libOptions] = send.mock.calls[0] ?? [];
    expect(subscription).toEqual({
      endpoint: target.endpoint,
      keys: { p256dh: target.p256dh, auth: target.auth },
    });
    expect(JSON.parse(String(body))).toEqual(payload);
    expect(libOptions).toMatchObject({
      urgency: "high",
      TTL: 7200,
      topic: options.topic,
      timeout: SEND_TIMEOUT_MS,
    });
  });

  it("spike: under Bun the library signs VAPID and encrypts the payload for a real browser key", () => {
    const details = generateRequestDetails(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      {
        vapidDetails: {
          subject: settings.vapidSubject,
          publicKey: settings.vapidPublicKey,
          privateKey: settings.vapidPrivateKey,
        },
        urgency: "high",
        TTL: 7200,
        topic: options.topic,
      },
    );

    expect(details.headers).toMatchObject({
      "Content-Encoding": "aes128gcm",
      Urgency: "high",
      TTL: 7200,
      Topic: options.topic,
    });
    expect(String(details.headers.Authorization)).toStartWith("vapid t=");
    expect(details.body?.length ?? 0).toBeGreaterThan(JSON.stringify(payload).length);
  });

  it("spike: the library refuses a topic longer than 32 characters, so alert-<uuid> cannot be used", () => {
    expect(() =>
      generateRequestDetails({ endpoint: target.endpoint, keys: browserKeys() }, "x", {
        topic: "alert-0196a000-0000-7000-8000-0000000000a1",
      }),
    ).toThrow("maximum of 32 characters");
  });
});
