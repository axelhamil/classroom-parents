import { useSyncExternalStore } from "react";
import {
  createPaletteStore,
  PALETTE_STORAGE_KEY,
  type Palette,
  type PaletteHost,
  type PaletteStore,
} from "./palette-store";
import { onStorageKeyChange, readStorage, swapInstantly, writeStorage } from "./theme-dom";
import { type RevealOrigin, transitionTheme } from "./theme-transition";

const browserHost: PaletteHost = {
  readStored: () => readStorage(PALETTE_STORAGE_KEY),

  writeStored: (palette) => writeStorage(PALETTE_STORAGE_KEY, palette),

  onStoredChange: (listener) => onStorageKeyChange(PALETTE_STORAGE_KEY, listener),

  apply: (palette) => swapInstantly((root) => root.setAttribute("data-palette", palette)),
};

let paletteStore: PaletteStore | undefined;

function getPaletteStore() {
  paletteStore ??= createPaletteStore(browserHost);

  return paletteStore;
}

export function changePalette(palette: Palette, origin: RevealOrigin | null): Promise<void> {
  const store = getPaletteStore();
  if (store.getPalette() === palette) return Promise.resolve();

  return transitionTheme(origin, () => store.setPalette(palette));
}

/** Shows `palette` on the page without keeping it, for a preview under the pointer or the focus; `null` puts the chosen one back. */
export function previewPalette(palette: Palette | null) {
  const shown = palette ?? getPaletteStore().getPalette();
  if (document.documentElement.dataset.palette === shown) return;

  browserHost.apply(shown);
}

export function usePalette() {
  const store = getPaletteStore();
  const palette = useSyncExternalStore(store.subscribe, store.getPalette);

  return { palette, changePalette, previewPalette };
}
