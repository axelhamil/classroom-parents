import { describe, expect, it, vi } from "vitest";
import { createThemeStore, type ThemeHost } from "../theme-store";

function givenHost(stored: string | null, systemDark: boolean) {
  const systemListeners: Array<() => void> = [];
  const storedListeners: Array<() => void> = [];
  const state = { stored, systemDark };

  const host: ThemeHost = {
    readStored: () => state.stored,
    writeStored: vi.fn(),
    systemPrefersDark: () => state.systemDark,
    onSystemChange: (listener) => {
      systemListeners.push(listener);
      return vi.fn();
    },
    onStoredChange: (listener) => {
      storedListeners.push(listener);
      return vi.fn();
    },
    applyResolved: vi.fn(),
  };

  const changeSystem = (dark: boolean) => {
    state.systemDark = dark;
    for (const listener of systemListeners) listener();
  };

  const changeStoredElsewhere = (value: string) => {
    state.stored = value;
    for (const listener of storedListeners) listener();
  };

  return { host, changeSystem, changeStoredElsewhere };
}

describe("theme store", () => {
  it("keeps the stored choice when the system preference changes", () => {
    const { host, changeSystem } = givenHost("light", true);
    const store = createThemeStore(host);
    store.subscribe(vi.fn());

    changeSystem(false);
    changeSystem(true);

    expect(store.getState()).toEqual({ theme: "light", resolvedTheme: "light" });
    expect(host.applyResolved).not.toHaveBeenCalled();
  });

  it("starts light when nothing is stored even if the system prefers dark", () => {
    const { host, changeSystem } = givenHost(null, true);
    const store = createThemeStore(host);
    store.subscribe(vi.fn());

    changeSystem(true);

    expect(store.getState()).toEqual({ theme: "light", resolvedTheme: "light" });
    expect(host.applyResolved).not.toHaveBeenCalled();
  });

  it("follows the system preference when the stored choice is system", () => {
    const { host, changeSystem } = givenHost("system", false);
    const store = createThemeStore(host);
    store.subscribe(vi.fn());

    changeSystem(true);

    expect(store.getState()).toEqual({ theme: "system", resolvedTheme: "dark" });
    expect(host.applyResolved).toHaveBeenCalledWith("dark");
  });

  it("follows the system live once the parent picks Automatique", () => {
    const { host, changeSystem } = givenHost("light", true);
    const store = createThemeStore(host);
    store.subscribe(vi.fn());

    store.setTheme("system");
    changeSystem(false);

    expect(host.writeStored).toHaveBeenCalledWith("system");
    expect(store.getState()).toEqual({ theme: "system", resolvedTheme: "light" });
    expect(host.applyResolved).toHaveBeenNthCalledWith(1, "dark");
    expect(host.applyResolved).toHaveBeenNthCalledWith(2, "light");
  });

  it("takes the choice made in another tab", () => {
    const { host, changeStoredElsewhere } = givenHost("light", false);
    const store = createThemeStore(host);
    const listener = vi.fn();
    store.subscribe(listener);

    changeStoredElsewhere("dark");

    expect(store.getState()).toEqual({ theme: "dark", resolvedTheme: "dark" });
    expect(host.applyResolved).toHaveBeenCalledWith("dark");
    expect(listener).toHaveBeenCalled();
  });

  it("falls back to light when the stored value is unknown", () => {
    const { host } = givenHost("sepia", true);

    expect(createThemeStore(host).getState()).toEqual({ theme: "light", resolvedTheme: "light" });
  });

  it("resolves a choice against the current system without applying it", () => {
    const { host } = givenHost("light", true);
    const store = createThemeStore(host);

    expect(store.resolve("system")).toBe("dark");
    expect(store.resolve("light")).toBe("light");
    expect(host.applyResolved).not.toHaveBeenCalled();
  });
});
