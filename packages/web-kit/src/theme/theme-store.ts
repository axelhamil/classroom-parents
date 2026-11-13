export const THEME_STORAGE_KEY = "theme";

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = "light" | "dark";

export interface ThemeState {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
}

export interface ThemeHost {
  readStored: () => string | null;
  writeStored: (theme: ThemePreference) => void;
  systemPrefersDark: () => boolean;
  onSystemChange: (listener: () => void) => () => void;
  onStoredChange: (listener: () => void) => () => void;
  applyResolved: (resolved: ResolvedTheme) => void;
}

export function isThemePreference(value: string | null): value is ThemePreference {
  return THEME_PREFERENCES.some((preference) => preference === value);
}

function parsePreference(stored: string | null): ThemePreference {
  return isThemePreference(stored) ? stored : "light";
}

export function createThemeStore(host: ThemeHost) {
  let preference = parsePreference(host.readStored());
  const listeners = new Set<() => void>();
  let detach: (() => void) | undefined;

  const resolve = (theme: ThemePreference): ResolvedTheme => {
    if (theme !== "system") return theme;

    return host.systemPrefersDark() ? "dark" : "light";
  };

  let state: ThemeState = { theme: preference, resolvedTheme: resolve(preference) };

  const refresh = () => {
    const resolvedTheme = resolve(preference);
    if (state.theme === preference && state.resolvedTheme === resolvedTheme) return;

    if (state.resolvedTheme !== resolvedTheme) host.applyResolved(resolvedTheme);
    state = { theme: preference, resolvedTheme };
    for (const listener of listeners) listener();
  };

  const attach = () => {
    const detachSystem = host.onSystemChange(refresh);
    const detachStored = host.onStoredChange(() => {
      preference = parsePreference(host.readStored());
      refresh();
    });

    return () => {
      detachSystem();
      detachStored();
    };
  };

  return {
    getState: () => state,

    resolve,

    setTheme: (theme: ThemePreference) => {
      preference = theme;
      host.writeStored(theme);
      refresh();
    },

    subscribe: (listener: () => void) => {
      if (listeners.size === 0) detach = attach();
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) detach?.();
      };
    },
  };
}

export type ThemeStore = ReturnType<typeof createThemeStore>;
