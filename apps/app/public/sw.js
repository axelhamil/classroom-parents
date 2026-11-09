const FALLBACK = {
  title: "Échéances Classroom",
  body: "Une échéance approche. Ouvrez l'application pour la voir.",
  navigate: "/",
};

function safeTarget(navigate) {
  if (typeof navigate !== "string" || !navigate.startsWith("/") || navigate.startsWith("//")) {
    return "/";
  }

  return navigate;
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
  const { title, body, navigate } = readNotification(event.data);

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      lang: "fr",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { navigate },
    }),
  );
});

async function openTarget(navigate) {
  const url = new URL(safeTarget(navigate), self.location.origin).href;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = windows[0];

  if (!existing) {
    await self.clients.openWindow(url);
    return;
  }

  const focused = await existing.focus();
  if (focused.url !== url) await focused.navigate(url);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openTarget(event.notification.data?.navigate));
});
