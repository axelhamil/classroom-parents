import { useSyncExternalStore } from "react";
import { onStorageKeyChange, readStorage, swapInstantly, writeStorage } from "./theme-dom";
import {
  createThemeStore,
  type ResolvedTheme,
  THEME_STORAGE_KEY,
  type ThemeHost,
  type ThemePreference,
} from "./theme-store";
import { createThemeSwitcher } from "./theme-switch";
import { type RevealOrigin, transitionTheme } from "./theme-transition";

const systemQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function applyResolved(resolved: ResolvedTheme) {
  swapInstantly((root) => root.classList.toggle("dark", resolved === "dark"));
}

const browserHost: ThemeHost = {
  readStored: () => readStorage(THEME_STORAGE_KEY),

  writeStored: (theme) => writeStorage(THEME_STORAGE_KEY, theme),

  systemPrefersDark: () => systemQuery().matches,

  onSystemChange: (listener) => {
    const query = systemQuery();
    query.addEventListener("change", listener);

    return () => query.removeEventListener("change", listener);
  },

  onStoredChange: (listener) => onStorageKeyChange(THEME_STORAGE_KEY, listener),

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
