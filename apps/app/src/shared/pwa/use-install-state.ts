import { useSyncExternalStore } from "react";

export type InstallPlatform = "ios" | "android" | "desktop";

export interface InstallState {
  platform: InstallPlatform;
  standalone: boolean;
  canPromptInstall: boolean;
}

const STANDALONE_QUERY = "(display-mode: standalone)";

let installPrompt: Event | undefined;
const promptListeners = new Set<() => void>();

function notifyPromptChange(): void {
  for (const listener of promptListeners) listener();
}

export function captureInstallPrompt(target: Window = window): () => void {
  const onPrompt = (event: Event) => {
    event.preventDefault();
    installPrompt = event;
    notifyPromptChange();
  };
  const onInstalled = () => {
    installPrompt = undefined;
    notifyPromptChange();
  };

  target.addEventListener("beforeinstallprompt", onPrompt);
  target.addEventListener("appinstalled", onInstalled);

  return () => {
    target.removeEventListener("beforeinstallprompt", onPrompt);
    target.removeEventListener("appinstalled", onInstalled);
    installPrompt = undefined;
  };
}

function subscribePrompt(listener: () => void): () => void {
  promptListeners.add(listener);
  return () => promptListeners.delete(listener);
}

function subscribeStandalone(listener: () => void): () => void {
  const query = window.matchMedia(STANDALONE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function isStandalone(): boolean {
  const iosStandalone = "standalone" in navigator && navigator.standalone === true;

  return iosStandalone || window.matchMedia(STANDALONE_QUERY).matches;
}

function detectPlatform(userAgent: string, touchPoints: number): InstallPlatform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ios";
  if (/Macintosh/.test(userAgent) && touchPoints > 1) return "ios";
  if (/Android/.test(userAgent)) return "android";

  return "desktop";
}

export function useInstallState(): InstallState {
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone);
  const canPromptInstall = useSyncExternalStore(subscribePrompt, () => installPrompt !== undefined);

  return {
    platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
    standalone,
    canPromptInstall,
  };
}
