import type { Option, Result } from "@packages/ddd-kit";
import type { AlertsError } from "./alert-repository.port";

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface NewPushSubscription {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: Option<string>;
  sessionId: Option<string>;
  now: Date;
}

export interface StoredPushSubscription {
  id: string;
  previousUserId: Option<string>;
}

export interface IPushSubscriptionRepository {
  upsert(subscription: NewPushSubscription): Promise<Result<StoredPushSubscription, AlertsError>>;

  deleteOwned(userId: string, endpoint: string): Promise<Result<Option<string>, AlertsError>>;

  deleteForSession(userId: string, sessionId: string): Promise<Result<string[], AlertsError>>;

  deleteGone(userId: string, subscriptionId: string): Promise<Result<void, AlertsError>>;

  listForUser(userId: string): Promise<Result<PushSubscriptionRecord[], AlertsError>>;

  countForUser(userId: string): Promise<Result<number, AlertsError>>;
}
