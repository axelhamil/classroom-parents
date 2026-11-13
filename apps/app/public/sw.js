const FALLBACK = {
  title: "KeepUpKids",
  body: "Une échéance approche. Ouvrez l'application pour la voir.",
  navigate: "/",
};

function safeTarget(navigate) {
  if (typeof navigate !== "string") return "/";

  try {
    const url = new URL(navigate, self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search + url.hash : "/";
  } catch {
    return "/";
  }
}

function readNotification(data) {
  try {
    const notification = data?.json()?.notification;
    if (typeof notification?.title !== "string" || typeof notification?.body !== "string") {
      return FALLBACK;
    }

    return {
      title: notification.title,
      body: notification.body,
      navigate: safeTarget(notification.navigate),
      tag: typeof notification.tag === "string" && notification.tag ? notification.tag : undefined,
    };
  } catch {
    return FALLBACK;
  }
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const { title, body, navigate, tag } = readNotification(event.data);
  const grouping = tag ? { tag, renotify: true } : {};

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      lang: "fr",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { navigate },
      ...grouping,
    }),
  );
});

const NAVIGATE_MESSAGE = "keepupkids:navigate";
const ANSWER_TIMEOUT_MS = 500;

function askAppToNavigate(client, path) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(false);
    }, ANSWER_TIMEOUT_MS);
    channel.port1.onmessage = () => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(true);
    };
    client.postMessage({ type: NAVIGATE_MESSAGE, path }, [channel.port2]);
  });
}

async function openTarget(navigate) {
  const path = safeTarget(navigate);
  const url = new URL(path, self.location.origin).href;
  const controlled = await self.clients.matchAll({ type: "window" });
  const any = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = controlled[0] ?? any[0];

  if (!existing) {
    await self.clients.openWindow(url);
    return;
  }

  const focused = await existing.focus();
  if (focused.url === url) return;
  if (await askAppToNavigate(focused, path)) return;

  try {
    await focused.navigate(url);
  } catch {
    await self.clients.openWindow(url);
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openTarget(event.notification.data?.navigate));
});
