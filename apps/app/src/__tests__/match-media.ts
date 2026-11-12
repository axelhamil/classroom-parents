import { vi } from "vitest";

export function ensureMatchMedia(): void {
  if (typeof window.matchMedia === "function") return;

  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}
