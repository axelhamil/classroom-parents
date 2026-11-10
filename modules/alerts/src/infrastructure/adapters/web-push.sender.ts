import { type IInstrumentation, Result } from "@packages/ddd-kit";
import {
  type PushSubscription,
  type RequestOptions,
  sendNotification,
  WebPushError,
} from "web-push";
import type { AlertsSettings } from "../../application/config/alerts-settings";
import { SEND_TIMEOUT_MS } from "../../application/config/dispatch-budget";
import type {
  IPushSender,
  PushFailure,
  PushOptions,
  PushPayload,
  PushTarget,
} from "../../application/ports/push-sender.port";

const GONE_STATUSES = new Set([404, 410]);

type SendNotification = (
  subscription: PushSubscription,
  payload: string,
  options: RequestOptions,
) => Promise<unknown>;

export class WebPushSender implements IPushSender {
  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly settings: Pick<
      AlertsSettings,
      "vapidPublicKey" | "vapidPrivateKey" | "vapidSubject"
    >,
    private readonly deliver: SendNotification = sendNotification,
  ) {}

  async send(
    target: PushTarget,
    payload: PushPayload,
    options: PushOptions,
  ): Promise<Result<void, PushFailure>> {
    const host = new URL(target.endpoint).host;
    return this.instrumentation.startSpan({ name: "WebPushSender > send" }, async () => {
      try {
        await this.instrumentation.startSpan(
          {
            name: "POST push service",
            op: "http.client",
            attributes: { "server.address": host },
          },
          () =>
            this.deliver(
              { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
              JSON.stringify(payload),
              {
                vapidDetails: {
                  subject: this.settings.vapidSubject,
                  publicKey: this.settings.vapidPublicKey,
                  privateKey: this.settings.vapidPrivateKey,
                },
                urgency: options.urgency,
                TTL: options.ttlSeconds,
                topic: options.topic,
                timeout: SEND_TIMEOUT_MS,
              },
            ),
        );
        return Result.ok();
      } catch (err) {
        const status = err instanceof WebPushError ? String(err.statusCode) : "network";
        if (err instanceof WebPushError && GONE_STATUSES.has(err.statusCode))
          return Result.fail("PUSH_GONE");

        this.instrumentation.capture(new Error(`push failed ${status} ${host}`));
        return Result.fail("PUSH_FAILED");
      }
    });
  }
}
