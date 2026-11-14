import type { IInstrumentation } from "@packages/ddd-kit";
import { UserStreamMessage } from "@packages/events/user-stream-message";
import { PgListener, type PgListenerOptions } from "@packages/outbox/pg-listener";
import { z } from "zod";
import type { Logger } from "../logger";

export const USER_STREAM_CHANNEL = "user_stream";

export const MAX_STREAMS_PER_USER = 5;

type StreamHandle = (message: UserStreamMessage) => void;

const UserStreamNotification = z.object({ userId: z.string(), message: UserStreamMessage });

export function userStreamNotification(userId: string, message: UserStreamMessage): string {
  return JSON.stringify({ userId, message });
}

function parseNotification(payload: string | undefined) {
  if (payload === undefined) return undefined;

  try {
    const parsed = UserStreamNotification.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export class NotificationStreamHub {
  private readonly subscribers = new Map<string, Set<StreamHandle>>();
  private readonly listener: PgListener;
  private listening: Promise<void> | undefined;

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
        onNotification: (payload) => this.dispatch(payload),
      },
      logger,
      instrumentation,
      options,
    );
  }

  subscribe(userId: string, onSignal: StreamHandle): () => void {
    const existing = this.subscribers.get(userId) ?? new Set<StreamHandle>();
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

  dispatch(payload: string | undefined): void {
    const notification = parseNotification(payload);
    if (!notification) return;

    const handles = this.subscribers.get(notification.userId);
    if (!handles) return;
    for (const handle of handles) {
      try {
        handle(notification.message);
      } catch (err) {
        this.logger.warn({ err }, "notification stream handle failed");
        this.instrumentation.capture(err);
      }
    }
  }

  start(): Promise<void> {
    this.listening ??= this.listen();
    return this.listening;
  }

  private async listen(): Promise<void> {
    await this.listener.start();
    this.logger.info("notification stream hub started");
  }

  async stop(): Promise<void> {
    this.listening = undefined;
    await this.listener.stop();
    this.subscribers.clear();
    this.logger.info("notification stream hub stopped");
  }
}
