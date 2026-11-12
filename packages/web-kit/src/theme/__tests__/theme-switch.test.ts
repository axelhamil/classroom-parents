import { describe, expect, it, vi } from "vitest";
import { createThemeStore, type ThemeHost } from "../theme-store";
import { createThemeSwitcher } from "../theme-switch";

function givenSwitcher(stored: string, systemDark: boolean) {
  const host: ThemeHost = {
    readStored: () => stored,
    writeStored: vi.fn(),
    systemPrefersDark: () => systemDark,
    onSystemChange: () => vi.fn(),
    onStoredChange: () => vi.fn(),
    applyResolved: vi.fn(),
  };
  const store = createThemeStore(host);
  const pending: Array<() => void> = [];
  const transition = vi.fn((_origin: unknown, apply: () => void) => {
    pending.push(apply);
    return Promise.resolve();
  });
  const runPendingTransitions = () => {
    for (const apply of pending.splice(0)) apply();
  };

  return {
    host,
    store,
    transition,
    runPendingTransitions,
    change: createThemeSwitcher(store, transition),
  };
}

describe("theme switch", () => {
  it("keeps the last choice when a second one comes before the first transition applied", async () => {
    const { host, store, change, runPendingTransitions } = givenSwitcher("light", false);

    await change("dark", null);
    await change("system", null);
    runPendingTransitions();

    expect(store.getState()).toEqual({ theme: "system", resolvedTheme: "light" });
    expect(host.writeStored).toHaveBeenLastCalledWith("system");
  });

  it("animates the way back when the parent returns to the theme still on screen", async () => {
    const { store, change, transition, runPendingTransitions } = givenSwitcher("light", false);

    await change("dark", null);
    await change("light", null);
    runPendingTransitions();

    expect(transition).toHaveBeenCalledTimes(2);
    expect(store.getState()).toEqual({ theme: "light", resolvedTheme: "light" });
  });

  it("applies at once, without a transition, a choice that resolves to the theme on screen", async () => {
    const { store, change, transition } = givenSwitcher("light", false);

    await change("system", null);

    expect(transition).not.toHaveBeenCalled();
    expect(store.getState()).toEqual({ theme: "system", resolvedTheme: "light" });
  });
});
