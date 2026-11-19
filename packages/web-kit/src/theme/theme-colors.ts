import type { Palette } from "./palette-store";
import type { ResolvedTheme } from "./theme-store";

/** The `--background` of each palette and mode as hex, painted on the browser chrome (`theme-color`); `theme-init.js` holds the same table. */
export const THEME_COLORS = {
  paper: { light: "#f5f5f1", dark: "#13161d" },
  slate: { light: "#ecf1f4", dark: "#151e1e" },
  sage: { light: "#eef5ee", dark: "#131a15" },
  ink: { light: "#f5f4f8", dark: "#16151f" },
} as const satisfies Record<Palette, Record<ResolvedTheme, string>>;
