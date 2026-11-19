import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { saveOfflineNow } from "../offline/query-persistence";

const SKIP_WAITING_MESSAGE = "keepupkids:skip-waiting";
const TOAST_ID = "new-version";

interface InstalledWorker extends EventTarget {
  readonly state: ServiceWorkerState;
  postMessage(message: unknown): void;
}

interface WorkerRegistration extends EventTarget {
  readonly waiting: InstalledWorker | null;
  readonly installing: InstalledWorker | null;
}

interface WorkerContainer {
  readonly controller: unknown;
}

let waiting: InstalledWorker | undefined;
const listeners = new Set<() => void>();

function offerNewVersion(worker: InstalledWorker): void {
  waiting = worker;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function replacesARunningVersion(container: WorkerContainer): boolean {
  return container.controller !== null;
}

/**
 * Offers the reload once a new worker has installed behind the one serving this page. The
 * first worker of a device replaces nothing, so it is never offered: it activates by itself.
 */
export function watchForNewVersion(
  registration: WorkerRegistration,
  container: WorkerContainer = navigator.serviceWorker,
): void {
  if (registration.waiting && replacesARunningVersion(container))
    offerNewVersion(registration.waiting);

  registration.addEventListener("updatefound", () => {
    const next = registration.installing;
    if (!next) return;

    next.addEventListener("statechange", () => {
      if (next.state === "installed" && replacesARunningVersion(container)) offerNewVersion(next);
    });
  });
}

async function reloadIntoNewVersion(queryClient: QueryClient): Promise<void> {
  const worker = waiting;
  if (!worker) return;

  await saveOfflineNow(queryClient).catch(() => undefined);
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), {
    once: true,
  });
  worker.postMessage({ type: SKIP_WAITING_MESSAGE });
}

export function NewVersionToast() {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const ready = useSyncExternalStore(
    subscribe,
    () => waiting !== undefined,
    () => false,
  );

  useEffect(() => {
    if (!ready) return;

    toast(t("newVersion.ready"), {
      id: TOAST_ID,
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: t("newVersion.reload"),
        onClick: () => void reloadIntoNewVersion(queryClient),
      },
    });
  }, [ready, t, queryClient]);

  return null;
}
