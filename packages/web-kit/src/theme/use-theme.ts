import { useSyncExternalStore } from "react";
import { THEME_COLORS } from "./theme-colors";
import {
  createThemeStore,
  type ResolvedTheme,
  THEME_STORAGE_KEY,
  type ThemeHost,
  type ThemePreference,
} from "./theme-store";
import { createThemeSwitcher } from "./theme-switch";
import { type RevealOrigin, transitionTheme } from "./theme-transition";

const SWITCHING_CLASS = "theme-switching";

const systemQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function applyResolved(resolved: ResolvedTheme) {
  const root = document.documentElement;

  root.classList.add(SWITCHING_CLASS);
  root.classList.toggle("dark", resolved === "dark");
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", THEME_COLORS[resolved]);
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove(SWITCHING_CLASS));
  });
}

const browserHost: ThemeHost = {
  readStored: () => {
    try {
      return window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      return null;
    }
  },

  writeStored: (theme) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      return;
    }
  },

  systemPrefersDark: () => systemQuery().matches,

  onSystemChange: (listener) => {
    const query = systemQuery();
    query.addEventListener("change", listener);

    return () => query.removeEventListener("change", listener);
  },

  onStoredChange: (listener) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) listener();
    };
    window.addEventListener("storage", onStorage);

    return () => window.removeEventListener("storage", onStorage);
  },

  applyResolved,
};

let themeStore: ReturnType<typeof createThemeStore> | undefined;

function getThemeStore() {
  themeStore ??= createThemeStore(browserHost);

  return themeStore;
}

let switchTheme:
  | ((theme: ThemePreference, origin: RevealOrigin | null) => Promise<void>)
  | undefined;

export function changeTheme(theme: ThemePreference, origin: RevealOrigin | null): Promise<void> {
  switchTheme ??= createThemeSwitcher(getThemeStore(), transitionTheme);

  return switchTheme(theme, origin);
}

export function useTheme() {
  const store = getThemeStore();
  const state = useSyncExternalStore(store.subscribe, store.getState);

  return { ...state, changeTheme };
}
