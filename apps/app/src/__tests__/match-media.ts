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

export function ensureGetAnimations(): void {
  if (typeof Element.prototype.getAnimations === "function") return;

  Element.prototype.getAnimations = () => [];
}
