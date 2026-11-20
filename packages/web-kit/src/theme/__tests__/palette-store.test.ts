import { describe, expect, it, vi } from "vitest";
import { createPaletteStore, type PaletteHost } from "../palette-store";

function givenHost(stored: string | null) {
  const storedListeners: Array<() => void> = [];
  const state = { stored };

  const host: PaletteHost = {
    readStored: () => state.stored,
    writeStored: vi.fn(),
    onStoredChange: (listener) => {
      storedListeners.push(listener);
      return vi.fn();
    },
    apply: vi.fn(),
  };

  const changeStoredElsewhere = (value: string) => {
    state.stored = value;
    for (const listener of storedListeners) listener();
  };

  return { host, changeStoredElsewhere };
}

describe("palette store", () => {
  it("starts on paper when nothing or an unknown palette is stored", () => {
    expect(createPaletteStore(givenHost(null).host).getPalette()).toBe("paper");
    expect(createPaletteStore(givenHost("sepia").host).getPalette()).toBe("paper");
  });

  it("keeps, applies and announces the palette the parent picks", () => {
    const { host } = givenHost("paper");
    const store = createPaletteStore(host);
    const listener = vi.fn();
    store.subscribe(listener);

    store.setPalette("night");

    expect(store.getPalette()).toBe("night");
    expect(host.writeStored).toHaveBeenCalledWith("night");
    expect(host.apply).toHaveBeenCalledWith("night");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("takes the palette picked in another tab", () => {
    const { host, changeStoredElsewhere } = givenHost("paper");
    const store = createPaletteStore(host);
    store.subscribe(vi.fn());

    changeStoredElsewhere("slate");

    expect(store.getPalette()).toBe("slate");
    expect(host.apply).toHaveBeenCalledWith("slate");
  });
});
