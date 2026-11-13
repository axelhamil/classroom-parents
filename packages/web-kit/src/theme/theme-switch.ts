import type { ThemePreference, ThemeStore } from "./theme-store";
import type { RevealOrigin } from "./theme-transition";

type ThemeTransition = (origin: RevealOrigin | null, apply: () => void) => Promise<void>;

export function createThemeSwitcher(store: ThemeStore, transition: ThemeTransition) {
  let requested: ThemePreference | undefined;

  const applyRequested = () => {
    if (requested === undefined) return;

    store.setTheme(requested);
    requested = undefined;
  };

  return (theme: ThemePreference, origin: RevealOrigin | null): Promise<void> => {
    const onScreen = store.resolve(requested ?? store.getState().theme);
    requested = theme;

    if (store.resolve(theme) === onScreen) {
      applyRequested();
      return Promise.resolve();
    }

    return transition(origin, applyRequested);
  };
}
