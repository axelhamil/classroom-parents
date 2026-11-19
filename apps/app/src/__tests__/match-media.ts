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

export function ensureScrollIntoView(): void {
  if (typeof Element.prototype.scrollIntoView === "function") return;

  Element.prototype.scrollIntoView = () => undefined;
}

export function ensureResizeObserver(): void {
  if (typeof window.ResizeObserver === "function") return;

  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}
