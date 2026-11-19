export const PALETTE_STORAGE_KEY = "palette";

export const PALETTES = ["paper", "slate", "sage", "ink"] as const;

export type Palette = (typeof PALETTES)[number];

export const DEFAULT_PALETTE: Palette = "paper";

export interface PaletteHost {
  readStored: () => string | null;
  writeStored: (palette: Palette) => void;
  onStoredChange: (listener: () => void) => () => void;
  apply: (palette: Palette) => void;
}

export function isPalette(value: string | null | undefined): value is Palette {
  return PALETTES.some((palette) => palette === value);
}

export function parsePalette(stored: string | null | undefined): Palette {
  return isPalette(stored) ? stored : DEFAULT_PALETTE;
}

export function createPaletteStore(host: PaletteHost) {
  let palette = parsePalette(host.readStored());
  const listeners = new Set<() => void>();
  let detach: (() => void) | undefined;

  const show = (next: Palette) => {
    if (next === palette) return;

    palette = next;
    host.apply(next);
    for (const listener of listeners) listener();
  };

  return {
    getPalette: () => palette,

    setPalette: (next: Palette) => {
      host.writeStored(next);
      show(next);
    },

    subscribe: (listener: () => void) => {
      if (listeners.size === 0)
        detach = host.onStoredChange(() => show(parsePalette(host.readStored())));
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) detach?.();
      };
    },
  };
}

export type PaletteStore = ReturnType<typeof createPaletteStore>;
