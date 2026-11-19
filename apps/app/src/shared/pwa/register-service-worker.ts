import { captureError } from "../observability/sentry";
import { watchForNewVersion } from "./new-version";

const UPDATE_CHECK_EVERY_MS = 60 * 60_000;

function checkForUpdatesWhenShown(registration: ServiceWorkerRegistration): void {
  let checkedAt = Date.now();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || Date.now() - checkedAt < UPDATE_CHECK_EVERY_MS)
      return;

    checkedAt = Date.now();
    registration.update().catch(() => undefined);
  });
}

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then((registration) => {
      watchForNewVersion(registration);
      checkForUpdatesWhenShown(registration);
    })
    .catch((error: unknown) => captureError(error, { area: "service-worker" }));
}
