export const PALETTE_STORAGE_KEY = "palette";

/** The families the settings group palettes in, in display order. */
export const PALETTE_FAMILIES = ["classic", "vivid", "soft", "dark"] as const;

export type PaletteGroup = (typeof PALETTE_FAMILIES)[number];

/** The palettes of each family in the order the settings show them. */
export const PALETTE_GROUPS = {
  classic: ["paper", "slate", "contrast"],
  vivid: ["ocean", "forest", "coral", "mustard"],
  soft: ["rose", "mint", "sand"],
  dark: ["night", "abyss"],
} as const satisfies Record<PaletteGroup, readonly string[]>;

export const PALETTES = Object.values(PALETTE_GROUPS).flat();

export type Palette = (typeof PALETTE_GROUPS)[PaletteGroup][number];

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
