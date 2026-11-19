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

// The build writes /sw-precache.js (version + file list). Its bytes change with every
// deploy, which is what makes the browser install a new worker; in dev it is absent and
// the worker only relays push.
const SHELL_CACHE_PREFIX = "keepupkids-shell-";
const SHELL = "/index.html";
const NAVIGATION_TIMEOUT_MS = 4000;

function loadPrecache() {
  try {
    self.importScripts("/sw-precache.js");
  } catch {
    return null;
  }

  const manifest = self.PRECACHE;
  const valid =
    typeof manifest?.version === "string" &&
    Array.isArray(manifest.urls) &&
    manifest.urls.every((url) => typeof url === "string");

  return valid ? { cacheName: SHELL_CACHE_PREFIX + manifest.version, urls: manifest.urls } : null;
}

const precache = loadPrecache();

async function fillPrecache() {
  const cache = await self.caches.open(precache.cacheName);

  try {
    await cache.addAll(precache.urls.map((url) => new Request(url, { cache: "reload" })));
  } catch {
    await self.caches.delete(precache.cacheName);
  }
}

async function dropOtherVersions() {
  const names = await self.caches.keys();
  const stale = names.filter(
    (name) => name.startsWith(SHELL_CACHE_PREFIX) && name !== precache?.cacheName,
  );

  await Promise.all(stale.map((name) => self.caches.delete(name)));
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  if (precache) event.waitUntil(fillPrecache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([dropOtherVersions(), self.clients.claim()]));
});

// A navigation request cannot be rebuilt with a signal, so the timeout races the fetch
// instead of aborting it.
async function fetchWithin(request, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("navigation timed out")), timeoutMs);
  });

  try {
    return await Promise.race([self.fetch(request), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// HTML is never served from the cache while the network answers: a deploy is picked up
// on the next open, and the cached shell only stands in when the network fails or hangs.
async function networkFirstShell(request) {
  try {
    return await fetchWithin(request, NAVIGATION_TIMEOUT_MS);
  } catch (error) {
    const shell = await self.caches.match(SHELL, { cacheName: precache.cacheName });
    if (shell) return shell;

    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await self.caches.match(request, { cacheName: precache.cacheName });

  return cached ?? self.fetch(request);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!precache || request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") return event.respondWith(networkFirstShell(request));
  if (precache.urls.includes(url.pathname)) event.respondWith(cacheFirst(request));
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
