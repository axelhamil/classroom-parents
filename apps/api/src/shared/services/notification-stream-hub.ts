import type { IInstrumentation } from "@packages/ddd-kit";
import { PgListener, type PgListenerOptions } from "@packages/outbox/pg-listener";
import type { Logger } from "../logger";

export const USER_STREAM_CHANNEL = "user_stream";

export const MAX_STREAMS_PER_USER = 5;

export class NotificationStreamHub {
  private readonly subscribers = new Map<string, Set<() => void>>();
  private readonly listener: PgListener;
  private started = false;

  constructor(
    private readonly logger: Logger,
    databaseUrl: string,
    private readonly instrumentation: IInstrumentation,
    options: PgListenerOptions = {},
  ) {
    this.listener = new PgListener(
      {
        channel: USER_STREAM_CHANNEL,
        label: "notification stream hub",
        owner: "NotificationStreamHub",
        connectionString: databaseUrl,
        onNotification: (userId) => this.dispatchSignal(userId ?? ""),
      },
      logger,
      instrumentation,
      options,
    );
  }

  subscribe(userId: string, onSignal: () => void): () => void {
    const existing = this.subscribers.get(userId) ?? new Set<() => void>();
    existing.add(onSignal);
    this.subscribers.set(userId, existing);
    return () => {
      const handles = this.subscribers.get(userId);
      if (!handles) return;
      handles.delete(onSignal);
      if (handles.size === 0) this.subscribers.delete(userId);
    };
  }

  subscriberCount(userId: string): number {
    return this.subscribers.get(userId)?.size ?? 0;
  }

  dispatchSignal(userId: string): void {
    const handles = this.subscribers.get(userId);
    if (!handles) return;
    for (const handle of handles) {
      try {
        handle();
      } catch (err) {
        this.logger.warn({ err }, "notification stream handle failed");
        this.instrumentation.capture(err);
      }
    }
  }

  async start(): Promise<void> {
    if (this.started) return;

    this.started = true;
    await this.listener.start();
    this.logger.info("notification stream hub started");
  }

  async stop(): Promise<void> {
    this.started = false;
    await this.listener.stop();
    this.subscribers.clear();
    this.logger.info("notification stream hub stopped");
  }
}
