import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { generateRequestDetails } from "web-push";
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

export class WebPushSender implements IPushSender {
  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly settings: Pick<
      AlertsSettings,
      "vapidPublicKey" | "vapidPrivateKey" | "vapidSubject"
    >,
    private readonly timeoutMs: number = SEND_TIMEOUT_MS,
  ) {}

  async send(
    target: PushTarget,
    payload: PushPayload,
    options: PushOptions,
  ): Promise<Result<void, PushFailure>> {
    const host = new URL(target.endpoint).host;
    return this.instrumentation.startSpan({ name: "WebPushSender > send" }, async () => {
      const signal = AbortSignal.timeout(this.timeoutMs);
      try {
        const status = await this.instrumentation.startSpan(
          {
            name: "POST push service",
            op: "http.client",
            attributes: { "server.address": host },
          },
          () => this.post(target, payload, options, signal),
        );
        if (status >= 200 && status < 300) return Result.ok();
        if (GONE_STATUSES.has(status)) return Result.fail("PUSH_GONE");

        return this.failed(String(status), host);
      } catch {
        return this.failed(signal.aborted ? "timeout" : "network", host);
      }
    });
  }

  private async post(
    target: PushTarget,
    payload: PushPayload,
    options: PushOptions,
    signal: AbortSignal,
  ): Promise<number> {
    const request = generateRequestDetails(
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
      },
    );
    const headers = Object.fromEntries(
      Object.entries(request.headers).map(([name, value]) => [name, String(value)]),
    );
    const response = await fetch(request.endpoint, {
      method: request.method,
      headers,
      body: new Uint8Array(request.body),
      signal,
    });
    await response.body?.cancel();
    return response.status;
  }

  private failed(reason: string, host: string): Result<void, PushFailure> {
    this.instrumentation.capture(new Error(`push failed ${reason} ${host}`));
    return Result.fail("PUSH_FAILED");
  }
}
