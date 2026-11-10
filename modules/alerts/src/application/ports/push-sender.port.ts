import type { Result } from "@packages/ddd-kit";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  web_push: 8030;
  notification: { title: string; body: string; navigate: string };
}

export interface PushOptions {
  urgency: "high";
  ttlSeconds: number;
  topic: string;
}

export type PushFailure = "PUSH_GONE" | "PUSH_FAILED";

export interface IPushSender {
  send(
    target: PushTarget,
    payload: PushPayload,
    options: PushOptions,
  ): Promise<Result<void, PushFailure>>;
}
