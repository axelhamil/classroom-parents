import type { Result } from "@packages/ddd-kit";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface PushOptions {
  ttlSeconds: number;
  topic: string;
  urgency: "high" | "normal";
}

export type PushFailure = "PUSH_GONE" | "PUSH_FAILED";

export interface IPushSender {
  send(
    target: PushTarget,
    message: PushMessage,
    options: PushOptions,
  ): Promise<Result<void, PushFailure>>;
}
