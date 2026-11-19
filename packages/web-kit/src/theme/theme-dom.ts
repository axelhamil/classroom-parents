import { parsePalette } from "./palette-store";
import { THEME_COLORS } from "./theme-colors";

const SWITCHING_CLASS = "theme-switching";

/** Applies a theme change to `<html>` with every CSS transition off for two frames, so no utility transition lags behind the repaint. */
export function swapInstantly(change: (root: HTMLElement) => void) {
  const root = document.documentElement;

  root.classList.add(SWITCHING_CLASS);
  change(root);
  paintBrowserChrome(root);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove(SWITCHING_CLASS));
  });
}

function paintBrowserChrome(root: HTMLElement) {
  const mode = root.classList.contains("dark") ? "dark" : "light";
  const color = THEME_COLORS[parsePalette(root.dataset.palette)][mode];

  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", color);
  }
}

/** Reads a stored choice; a storage the browser refuses reads as no choice. */
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Stores a choice; a storage the browser refuses keeps it for this page only. */
export function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
}

/** Calls `listener` when another tab changes `key` or clears the storage. */
export function onStorageKeyChange(key: string, listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);

  return () => window.removeEventListener("storage", onStorage);
}
