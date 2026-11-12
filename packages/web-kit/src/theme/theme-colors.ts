import type { ResolvedTheme } from "./theme-store";

export const THEME_COLORS = {
  light: "#fbf5eb",
  dark: "#1b1612",
} as const satisfies Record<ResolvedTheme, string>;
