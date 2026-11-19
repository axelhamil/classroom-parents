import type { Palette } from "./palette-store";
import type { ResolvedTheme } from "./theme-store";

/** The `--background` of each palette and mode as hex, painted on the browser chrome (`theme-color`); `theme-init.js` holds the same table. */
export const THEME_COLORS = {
  paper: { light: "#f5f5f1", dark: "#13161d" },
  slate: { light: "#dde5ef", dark: "#111c1b" },
  contrast: { light: "#ffffff", dark: "#000000" },
  ocean: { light: "#d9f5ff", dark: "#041525" },
  forest: { light: "#e0f6db", dark: "#08180e" },
  coral: { light: "#ffe4d8", dark: "#20120e" },
  mustard: { light: "#fbedb8", dark: "#1b1508" },
  rose: { light: "#ffe9ec", dark: "#1e1216" },
  mint: { light: "#dbfcec", dark: "#091a15" },
  sand: { light: "#fbe7ce", dark: "#1c140c" },
  night: { light: "#e6e9ff", dark: "#090c21" },
  abyss: { light: "#cbfcfb", dark: "#001419" },
} as const satisfies Record<Palette, Record<ResolvedTheme, string>>;
