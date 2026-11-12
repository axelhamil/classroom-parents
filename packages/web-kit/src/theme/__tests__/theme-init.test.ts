import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { THEME_COLORS } from "../theme-colors";

const script = readFileSync(resolve(__dirname, "../theme-init.js"), "utf8");

function runThemeInit(getItem: () => string | null, systemDark: boolean) {
  const toggle = vi.fn();
  const setAttribute = vi.fn();
  const querySelectorAll = () => [{ setAttribute }, { setAttribute }];

  runInNewContext(script, {
    window: {
      localStorage: { getItem },
      matchMedia: () => ({ matches: systemDark }),
    },
    document: { documentElement: { classList: { toggle } }, querySelectorAll },
  });

  return Object.assign(toggle, { setAttribute });
}

describe("theme-init script", () => {
  it("lets the stored choice win over the system preference", () => {
    const toggle = runThemeInit(() => "light", true);

    expect(toggle).toHaveBeenCalledWith("dark", false);
  });

  it("applies light when no stored choice even if prefers-color-scheme is dark", () => {
    const unset = runThemeInit(() => null, true);
    const blocked = runThemeInit(() => {
      throw new Error("denied");
    }, true);

    expect(unset).toHaveBeenCalledWith("dark", false);
    expect(blocked).toHaveBeenCalledWith("dark", false);
  });

  it("applies dark before paint when stored choice is dark", () => {
    const toggle = runThemeInit(() => "dark", false);

    expect(toggle).toHaveBeenCalledWith("dark", true);
  });

  it("follows the system preference only when the stored choice is system", () => {
    const toggle = runThemeInit(() => "system", true);

    expect(toggle).toHaveBeenCalledWith("dark", true);
  });

  it("paints the browser chrome with the chosen theme on both color metas", () => {
    const { setAttribute } = runThemeInit(() => "dark", false);

    expect(setAttribute).toHaveBeenCalledTimes(2);
    expect(setAttribute).toHaveBeenCalledWith("content", THEME_COLORS.dark);
  });
});
