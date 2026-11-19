import type { Palette } from "./palette-store";
import type { ResolvedTheme } from "./theme-store";

/** The `--background` of each palette and mode as hex, painted on the browser chrome (`theme-color`); `theme-init.js` holds the same table. */
export const THEME_COLORS = {
  paper: { light: "#f5f5f1", dark: "#13161d" },
  slate: { light: "#eaf4fb", dark: "#111c1b" },
  contrast: { light: "#ffffff", dark: "#000000" },
  ocean: { light: "#e5f6ff", dark: "#041525" },
  forest: { light: "#eaf7e7", dark: "#08180e" },
  coral: { light: "#ffece4", dark: "#20120e" },
  mustard: { light: "#fdf3cd", dark: "#1b1508" },
  rose: { light: "#ffedef", dark: "#1e1216" },
  mint: { light: "#e1f9ed", dark: "#091a15" },
  sand: { light: "#fff0dd", dark: "#1c140c" },
  night: { light: "#eff1ff", dark: "#090c21" },
  abyss: { light: "#e0f8fa", dark: "#001419" },
} as const satisfies Record<Palette, Record<ResolvedTheme, string>>;
