import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { PALETTES } from "../palette-store";
import { THEME_COLORS } from "../theme-colors";

const script = readFileSync(resolve(__dirname, "../theme-init.js"), "utf8");

interface Stored {
  theme?: string | null;
  palette?: string | null;
}

function runThemeInit(stored: Stored | (() => never), systemDark: boolean) {
  const toggle = vi.fn();
  const setRootAttribute = vi.fn();
  const setAttribute = vi.fn();
  const querySelectorAll = () => [{ setAttribute }, { setAttribute }];
  const getItem =
    typeof stored === "function"
      ? stored
      : (key: string) => (key === "theme" ? stored.theme : stored.palette) ?? null;

  runInNewContext(script, {
    window: {
      localStorage: { getItem },
      matchMedia: () => ({ matches: systemDark }),
    },
    document: {
      documentElement: { classList: { toggle }, setAttribute: setRootAttribute },
      querySelectorAll,
    },
  });

  return { toggle, setRootAttribute, setAttribute };
}

describe("theme-init script", () => {
  it("lets the stored choice win over the system preference", () => {
    const { toggle } = runThemeInit({ theme: "light" }, true);

    expect(toggle).toHaveBeenCalledWith("dark", false);
  });

  it("applies light when no stored choice even if prefers-color-scheme is dark", () => {
    const unset = runThemeInit({}, true);
    const blocked = runThemeInit(() => {
      throw new Error("denied");
    }, true);

    expect(unset.toggle).toHaveBeenCalledWith("dark", false);
    expect(blocked.toggle).toHaveBeenCalledWith("dark", false);
    expect(blocked.setRootAttribute).toHaveBeenCalledWith("data-palette", "paper");
  });

  it("applies dark before paint when stored choice is dark", () => {
    const { toggle } = runThemeInit({ theme: "dark" }, false);

    expect(toggle).toHaveBeenCalledWith("dark", true);
  });

  it("follows the system preference only when the stored choice is system", () => {
    const { toggle } = runThemeInit({ theme: "system" }, true);

    expect(toggle).toHaveBeenCalledWith("dark", true);
  });

  it("sets the stored palette before paint and falls back to paper on an unknown one", () => {
    const chosen = runThemeInit({ palette: "forest" }, false);
    const unknown = runThemeInit({ palette: "toString" }, false);

    expect(chosen.setRootAttribute).toHaveBeenCalledWith("data-palette", "forest");
    expect(unknown.setRootAttribute).toHaveBeenCalledWith("data-palette", "paper");
  });

  it("paints the browser chrome with the same hex the running app uses, for every palette and mode", () => {
    for (const palette of PALETTES) {
      for (const theme of ["light", "dark"] as const) {
        const { setAttribute } = runThemeInit({ theme, palette }, false);

        expect(setAttribute).toHaveBeenCalledTimes(2);
        expect(setAttribute).toHaveBeenCalledWith("content", THEME_COLORS[palette][theme]);
      }
    }
  });
});
