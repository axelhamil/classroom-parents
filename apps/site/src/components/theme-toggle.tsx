import { IconButton } from "@packages/ui/components/ui/icon-button";
import { TooltipProvider } from "@packages/ui/components/ui/tooltip";
import { revealThemeChange } from "@packages/web-kit/theme/reveal-transition";
import { useTheme } from "@packages/web-kit/theme/use-theme";
import { Moon, Sun } from "lucide-react";

export interface ThemeToggleProps {
  switchToLight: string;
  switchToDark: string;
}

export function ThemeToggle({ switchToLight, switchToDark }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <TooltipProvider>
      <IconButton
        variant="ghost"
        label={isDark ? switchToLight : switchToDark}
        onClick={(event) =>
          void revealThemeChange(event.currentTarget, () => setTheme(isDark ? "light" : "dark"))
        }
      >
        <Sun className="dark:hidden" />
        <Moon className="hidden dark:block" />
      </IconButton>
    </TooltipProvider>
  );
}
