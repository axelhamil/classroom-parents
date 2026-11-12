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
  if (typeof Document.prototype.getAnimations === "function") return;

  Document.prototype.getAnimations = () => [];
}
