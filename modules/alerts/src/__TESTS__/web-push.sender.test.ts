import { afterEach, describe, expect, it } from "bun:test";
import { createDecipheriv, createECDH, type ECDH, hkdfSync, randomBytes } from "node:crypto";
import { createServer, type IncomingHttpHeaders } from "node:http";
import { createServer as createNetServer, type Socket } from "node:net";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { generateRequestDetails, generateVAPIDKeys } from "web-push";
import { SEND_TIMEOUT_MS } from "../application/config/dispatch-budget";
import type { PushMessage } from "../application/ports/push-sender.port";
import { WebPushSender } from "../infrastructure/adapters/web-push.sender";

const vapid = generateVAPIDKeys();
const settings = {
  vapidPublicKey: vapid.publicKey,
  vapidPrivateKey: vapid.privateKey,
  vapidSubject: "mailto:alerts@example.com",
};

function browserKeys(ecdh: ECDH = createECDH("prime256v1"), auth = randomBytes(16)) {
  ecdh.generateKeys();

  return { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") };
}

const browser = createECDH("prime256v1");
const browserAuth = randomBytes(16);
const target = {
  endpoint: "https://push.example.com/send/abc",
  ...browserKeys(browser, browserAuth),
};

function decrypted(body: Buffer): unknown {
  const salt = body.subarray(0, 16);
  const keyLength = body.readUInt8(20);
  const serverKey = body.subarray(21, 21 + keyLength);
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    browser.getPublicKey(),
    serverKey,
  ]);
  const ikm = hkdfSync("sha256", browser.computeSecret(serverKey), browserAuth, keyInfo, 32);
  const derive = (info: string, length: number) =>
    Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from(`Content-Encoding: ${info}\0`), length));
  const record = body.subarray(21 + keyLength);
  const decipher = createDecipheriv("aes-128-gcm", derive("aes128gcm", 16), derive("nonce", 12));
  decipher.setAuthTag(record.subarray(-16));
  const plain = Buffer.concat([decipher.update(record.subarray(0, -16)), decipher.final()]);

  return JSON.parse(plain.subarray(0, plain.lastIndexOf(2)).toString("utf8"));
}

const message: PushMessage = {
  title: "Contrôle de maths",
  body: "Léa, échéance dimanche 15 novembre",
  url: "https://app.example.com/events/1",
};
const payload = JSON.stringify(message);
const options = {
  ttlSeconds: 7200,
  topic: "0196a0000000700080000000000000a1",
};

interface PushService {
  url: string;
  received: Array<{ headers: IncomingHttpHeaders; body: Buffer }>;
  dropped: () => number;
  close: () => Promise<void>;
}

async function pushService(answer: number | "never"): Promise<PushService> {
  const received: PushService["received"] = [];
  let dropped = 0;
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks) });
      if (answer === "never") return;
      res.writeHead(answer).end();
    });
    res.on("close", () => {
      if (!res.writableEnded) dropped += 1;
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}/send/abc`,
    received,
    dropped: () => dropped,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

async function silentService() {
  let dropped = 0;
  const sockets = new Set<Socket>();
  const server = createNetServer((socket) => {
    sockets.add(socket);
    socket.resume();
    socket.on("close", () => {
      dropped += 1;
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    url: `https://127.0.0.1:${port}/send/abc`,
    dropped: () => dropped,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

let service: PushService | undefined;

afterEach(async () => {
  await service?.close();
  service = undefined;
});

async function sendTo(
  answer: number | "never",
  instrumentation = mockInstrumentation(),
  timeoutMs = SEND_TIMEOUT_MS,
) {
  service = await pushService(answer);
  const sender = new WebPushSender(instrumentation, settings, timeoutMs);
  return sender.send({ ...target, endpoint: service.url }, message, options);
}

describe("WebPushSender", () => {
  it.each([410, 404])("given the push service answers %d, then PUSH_GONE", async (status) => {
    const result = await sendTo(status);

    expect(result.getError()).toBe("PUSH_GONE");
  });

  it("given the push service answers 500, then PUSH_FAILED", async () => {
    const result = await sendTo(500);

    expect(result.getError()).toBe("PUSH_FAILED");
  });

  it("given the push service answers 429, then the captured error names the status and the service host, never the device endpoint", async () => {
    const instrumentation = mockInstrumentation();

    await sendTo(429, instrumentation);

    const captured = instrumentation.capture.mock.calls[0]?.[0];
    expect(captured).toBeInstanceOf(Error);
    expect(String(captured)).toContain("429 127.0.0.1");
    expect(JSON.stringify(captured)).not.toContain("/send/abc");
    expect(String(captured)).not.toContain("/send/abc");
  });

  it("given a push service that accepts the connection and never answers, then the send gives up within its timeout and drops the connection", async () => {
    const timeoutMs = 300;
    const silent = await silentService();
    const sender = new WebPushSender(mockInstrumentation(), settings, timeoutMs);
    const started = performance.now();

    const result = await sender.send({ ...target, endpoint: silent.url }, message, options);

    const elapsed = performance.now() - started;
    await new Promise((resolve) => setTimeout(resolve, 50));
    const dropped = silent.dropped();
    await silent.close();
    expect(result.getError()).toBe("PUSH_FAILED");
    expect(elapsed).toBeLessThan(timeoutMs + 500);
    expect(dropped).toBe(1);
  });

  it("given a delivery, then the encrypted payload goes out VAPID signed with the high urgency, 2 h TTL and topic", async () => {
    const result = await sendTo(201);

    expect(result.isSuccess).toBe(true);
    const [request] = service?.received ?? [];
    expect(request?.headers).toMatchObject({
      "content-encoding": "aes128gcm",
      urgency: "high",
      ttl: "7200",
      topic: options.topic,
    });
    expect(String(request?.headers.authorization)).toStartWith("vapid t=");
    expect(request?.body.length ?? 0).toBeGreaterThan(payload.length);
  });

  it("given a message, then the browser decrypts a declarative RFC 8030 notification that opens the event", async () => {
    await sendTo(201);

    const [request] = service?.received ?? [];
    expect(decrypted(request?.body ?? Buffer.alloc(0))).toEqual({
      web_push: 8030,
      notification: {
        title: "Contrôle de maths",
        body: "Léa, échéance dimanche 15 novembre",
        navigate: "https://app.example.com/events/1",
      },
    });
  });

  it("spike: under Bun the library signs VAPID and encrypts the payload for a real browser key", () => {
    const details = generateRequestDetails(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      payload,
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
    expect(details.body?.length ?? 0).toBeGreaterThan(payload.length);
  });

  it("spike: the library refuses a topic longer than 32 characters, so alert-<uuid> cannot be used", () => {
    expect(() =>
      generateRequestDetails({ endpoint: target.endpoint, keys: browserKeys() }, "x", {
        topic: "alert-0196a000-0000-7000-8000-0000000000a1",
      }),
    ).toThrow("maximum of 32 characters");
  });
});
