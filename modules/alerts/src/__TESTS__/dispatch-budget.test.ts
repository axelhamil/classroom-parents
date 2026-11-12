import { afterEach, describe, expect, it } from "bun:test";
import { createECDH, randomBytes } from "node:crypto";
import { createServer, type Server, type Socket } from "node:net";
import { type AppError, type ILogger, Option, Result } from "@packages/ddd-kit";
import { type ResendBatchClient, resendBatchSender } from "@packages/email/email-delivery-worker";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { generateVAPIDKeys } from "web-push";
import { DISPATCH_BATCH, DISPATCH_CONCURRENCY } from "../application/config/dispatch-budget";
import type { IAlertContextReader } from "../application/ports/alert-context-reader.port";
import type {
  AlertsError,
  ClaimedAlert,
  IAlertRepository,
} from "../application/ports/alert-repository.port";
import type { EventDeadline, IEventDeadlines } from "../application/ports/event-deadlines.port";
import type { IPushSubscriptionRepository } from "../application/ports/push-subscription-repository.port";
import { AlertDispatchService } from "../application/services/alert-dispatch.service";
import { I18nPushCopy } from "../infrastructure/adapters/i18n-push.copy";
import { ResendAlertEmailSender } from "../infrastructure/adapters/resend-alert-email.sender";
import { WebPushSender } from "../infrastructure/adapters/web-push.sender";
import { existingAlert, PARENT, paris } from "../testing/alert.fixture";

const SEND_TIMEOUT = 200;

interface Deadline {
  owner: "push" | "email";
  armedAt: number;
  controller: AbortController;
  dueAt: number;
}

function virtualClock() {
  let now = 0;
  const deadlines: Deadline[] = [];

  return {
    deadlines,
    now: () => now,
    deadlineFor:
      (owner: Deadline["owner"]) =>
      (ms: number): AbortSignal => {
        const controller = new AbortController();
        deadlines.push({ owner, armedAt: now, controller, dueAt: now + ms });
        return controller.signal;
      },
    armed: (owner: Deadline["owner"], at: number) =>
      deadlines.filter((deadline) => deadline.owner === owner && deadline.armedAt === at).length,
    advanceTo(at: number) {
      now = at;
      for (const deadline of deadlines)
        if (deadline.dueAt <= at && !deadline.controller.signal.aborted)
          deadline.controller.abort(new DOMException("deadline", "TimeoutError"));
    },
  };
}

async function settleUntil(condition: () => boolean): Promise<void> {
  while (!condition()) await new Promise((resolve) => setImmediate(resolve));
}

let server: Server | undefined;
const sockets = new Set<Socket>();

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function silentPushService(): Promise<string> {
  server = createServer((socket) => {
    sockets.add(socket);
    socket.resume();
  });
  const listening = server;
  await new Promise<void>((resolve) => listening.listen(0, "127.0.0.1", resolve));
  const address = listening.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return `https://127.0.0.1:${port}/send`;
}

const hangingMailProvider: ResendBatchClient = {
  batch: {
    send: (_entries, options) =>
      new Promise((resolve) => {
        options.signal.addEventListener("abort", () =>
          resolve({
            data: null,
            error: { name: "application_error", message: "aborted", statusCode: null },
          }),
        );
      }),
  },
};

function browserKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  };
}

describe("dispatch budget under silent providers", () => {
  it("given a full batch whose push service and mail provider never answer, then the batch hands back once its waves of push plus email timeouts have elapsed on the clock", async () => {
    const clock = virtualClock();
    const endpoint = await silentPushService();
    const vapid = generateVAPIDKeys();
    const batch: ClaimedAlert[] = Array.from({ length: DISPATCH_BATCH }, (_, i) => {
      const alert = existingAlert({
        id: `0196a000-0000-7000-8000-${String(i).padStart(12, "0")}`,
        userId: `parent-${i}`,
      });
      return {
        alert,
        lease: { alertId: alert.id.value, attempts: 1, version: alert.get("version") },
        failures: 0,
      };
    });
    const alerts = mockPort<IAlertRepository>();
    alerts.claimDue.mockResolvedValue(Result.ok<ClaimedAlert[], AlertsError>(batch));
    alerts.recordDelivery.mockResolvedValue(Result.ok());
    alerts.addFailure.mockResolvedValue(Result.ok(true));
    const subscriptions = mockPort<IPushSubscriptionRepository>();
    subscriptions.listForUser.mockResolvedValue(
      Result.ok([{ id: "sub-1", userId: PARENT, endpoint, ...browserKeys() }]),
    );
    subscriptions.lockScreenDetailsFor.mockResolvedValue(Result.ok(Option.none()));
    const contexts = mockPort<IAlertContextReader>();
    contexts.load.mockResolvedValue(
      Result.ok(
        batch.map(({ alert }) => ({
          alertId: alert.id.value,
          email: "parent@example.com",
          eventTitle: "Contrôle de maths",
          childLabel: "Léa",
          deadlineLabel: "dimanche 15 novembre",
          eventUrl: "https://app.example.com/events/1",
        })),
      ),
    );
    const deadlines = mockPort<IEventDeadlines>();
    deadlines.forUser.mockResolvedValue(
      Result.ok<Option<EventDeadline>, AppError>(
        Option.some({
          deadlineAt: paris("2026-11-15", "23:59"),
          deadlineDate: "2026-11-15",
          done: false,
          needsReview: false,
        }),
      ),
    );
    const instrumentation = mockInstrumentation();
    const service = new AlertDispatchService(
      alerts,
      subscriptions,
      new WebPushSender(
        instrumentation,
        {
          vapidPublicKey: vapid.publicKey,
          vapidPrivateKey: vapid.privateKey,
          vapidSubject: "mailto:alerts@example.com",
        },
        SEND_TIMEOUT,
        clock.deadlineFor("push"),
      ),
      new ResendAlertEmailSender(
        resendBatchSender(
          hangingMailProvider,
          instrumentation,
          mockPort<ILogger>(),
          SEND_TIMEOUT,
          clock.deadlineFor("email"),
        ),
        "alerts@example.com",
        instrumentation,
        mockPort<ILogger>(),
      ),
      contexts,
      new I18nPushCopy(),
      deadlines,
      mockUnitOfWork().unitOfWork,
      mockPort<IOutboxRepository>(),
      instrumentation,
    );
    const waves = Math.ceil(DISPATCH_BATCH / DISPATCH_CONCURRENCY);
    let handedBack = false;

    const run = service.runOnce(paris("2026-11-13", "18:00")).finally(() => {
      handedBack = true;
    });
    for (let wave = 0; wave < waves; wave += 1) {
      const waveStart = wave * (SEND_TIMEOUT + SEND_TIMEOUT);
      await settleUntil(() => clock.armed("push", waveStart) === DISPATCH_CONCURRENCY);
      clock.advanceTo(waveStart + SEND_TIMEOUT);
      await settleUntil(
        () => clock.armed("email", waveStart + SEND_TIMEOUT) === DISPATCH_CONCURRENCY,
      );
      expect(handedBack).toBe(false);
      clock.advanceTo(waveStart + SEND_TIMEOUT + SEND_TIMEOUT);
    }
    const result = await run;

    expect(clock.now()).toBe(waves * (SEND_TIMEOUT + SEND_TIMEOUT));
    expect(clock.deadlines).toHaveLength(DISPATCH_BATCH * 2);
    expect(result.getValue()).toEqual({ claimed: DISPATCH_BATCH, sent: 0, emailed: 0, missed: 0 });
    expect(alerts.addFailure).toHaveBeenCalledTimes(DISPATCH_BATCH);
  });
});
