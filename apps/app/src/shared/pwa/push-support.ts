import { z } from "zod";
import { deletePushSubscription } from "../api/mutations/delete-push-subscription";

export type PushPermission = NotificationPermission | "unsupported";

const OWNER_STORAGE_KEY = "push-owner";

const pushOwnerSchema = z.object({ userId: z.string(), endpoint: z.string() });

export type PushOwner = z.infer<typeof pushOwnerSchema>;

const pushSubscriptionBodySchema = z.object({
  endpoint: z.string(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export type PushSubscriptionBody = z.infer<typeof pushSubscriptionBodySchema>;

export function pushPermission(): PushPermission {
  const supported =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return "unsupported";

  return Notification.permission;
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;

  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.ready;

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(vapidPublicKey),
  });
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");

  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export function toSubscriptionBody(subscription: PushSubscription): PushSubscriptionBody {
  return pushSubscriptionBodySchema.parse(subscription.toJSON());
}

export function storedPushOwner(): PushOwner | undefined {
  try {
    const parsed = pushOwnerSchema.safeParse(
      JSON.parse(localStorage.getItem(OWNER_STORAGE_KEY) ?? "null"),
    );

    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function isOwnedBy(userId: string, subscription: PushSubscription | null): boolean {
  const owner = storedPushOwner();

  return (
    subscription !== null && owner?.userId === userId && owner.endpoint === subscription.endpoint
  );
}

export function rememberPushOwner(owner: PushOwner): void {
  try {
    localStorage.setItem(OWNER_STORAGE_KEY, JSON.stringify(owner));
  } catch {
    return;
  }
}

export async function unsubscribeFromPush(subscription: PushSubscription): Promise<void> {
  forgetPushOwner();

  try {
    await deletePushSubscription(subscription.endpoint);
  } finally {
    await subscription.unsubscribe();
  }
}

export function forgetPushOwner(): void {
  try {
    localStorage.removeItem(OWNER_STORAGE_KEY);
  } catch {
    return;
  }
}
