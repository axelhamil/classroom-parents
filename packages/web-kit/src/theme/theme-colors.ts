import type { ResolvedTheme } from "./theme-store";

export const THEME_COLORS = {
  light: "#f9f7ef",
  dark: "#152620",
} as const satisfies Record<ResolvedTheme, string>;
