import { vi } from "vitest";

export const VAPID_PUBLIC_KEY =
  "BGBCZfAxuiVqji6w4gSGHInl6w9m2h_qOF1CGDelFPvfUhoS093puWGVJk3dCGFQ7Z4kQJZet6MtcRdocO2OKew";

export interface FakePushSubscription {
  endpoint: string;
  toJSON(): { endpoint: string; keys: { p256dh: string; auth: string } };
  unsubscribe(): Promise<boolean>;
}

export function fakeSubscription(endpoint: string): FakePushSubscription {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: "p256dh-key", auth: "auth-key" } }),
    unsubscribe: vi.fn(async () => true),
  };
}

interface PushBrowserOptions {
  permission: NotificationPermission;
  answer?: NotificationPermission;
  existing?: FakePushSubscription | null;
  created?: FakePushSubscription;
}

export function givenPushBrowser({
  permission,
  answer = permission,
  existing = null,
  created = fakeSubscription("https://fcm.googleapis.com/fcm/send/new"),
}: PushBrowserOptions) {
  let current = existing;
  const requestPermission = vi.fn(async () => answer);
  const subscribe = vi.fn(async () => {
    current = created;
    return created;
  });
  const pushManager = { getSubscription: vi.fn(async () => current), subscribe };

  vi.stubGlobal("Notification", { permission, requestPermission });
  vi.stubGlobal("PushManager", class {});
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({ pushManager }),
      getRegistration: async () => ({ pushManager }),
    },
  });

  return { requestPermission, subscribe };
}

export function givenNoPushBrowser() {
  Reflect.deleteProperty(window.navigator, "serviceWorker");
  Reflect.deleteProperty(window, "PushManager");
  Reflect.deleteProperty(window, "Notification");
}

export function givenUserAgent(userAgent: string, standalone: boolean) {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(userAgent);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(display-mode: standalone)" ? standalone : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

export const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1";
export const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";
