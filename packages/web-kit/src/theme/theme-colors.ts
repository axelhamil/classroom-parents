import type { ResolvedTheme } from "./theme-store";

export const THEME_COLORS = {
  light: "#f8fbf9",
  dark: "#111513",
} as const satisfies Record<ResolvedTheme, string>;
