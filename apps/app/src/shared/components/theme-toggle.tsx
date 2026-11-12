import { IconButton } from "@packages/ui/components/ui/icon-button";
import { revealThemeChange } from "@packages/web-kit/theme/reveal-transition";
import { useTheme } from "@packages/web-kit/theme/use-theme";
import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

export function useThemeToggle() {
  const { t } = useTranslation("common");
  const { resolvedTheme, setTheme } = useTheme();

  const isDark = resolvedTheme === "dark";
  const next = isDark ? "light" : "dark";

  return {
    isDark,
    label: isDark ? t("theme.switchToLight") : t("theme.switchToDark"),
    toggle: (origin: EventTarget | null) =>
      void revealThemeChange(origin instanceof HTMLElement ? origin : null, () => setTheme(next)),
  };
}

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { label, toggle } = useThemeToggle();

  return (
    <IconButton
      variant="ghost"
      onClick={(event) => toggle(event.currentTarget)}
      label={label}
      className={className}
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </IconButton>
  );
}
