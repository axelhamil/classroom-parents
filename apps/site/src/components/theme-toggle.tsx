import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@packages/ui/components/ui/dropdown-menu";
import { IconButton } from "@packages/ui/components/ui/icon-button";
import { SwapIcon, type SwapIconOption } from "@packages/ui/components/ui/swap-icon";
import { TooltipProvider } from "@packages/ui/components/ui/tooltip";
import { isThemePreference, type ThemePreference } from "@packages/web-kit/theme/theme-store";
import { useTheme } from "@packages/web-kit/theme/use-theme";
import { Moon, Sun, SunMoon } from "lucide-react";
import { useId, useRef } from "react";

const THEME_OPTIONS = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: SunMoon },
] as const satisfies readonly SwapIconOption<ThemePreference>[];

export interface ThemeToggleProps {
  label: string;
  current: string;
  modes: Record<ThemePreference, string>;
}

export function ThemeToggle({ label, current, modes }: ThemeToggleProps) {
  const { theme, changeTheme } = useTheme();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();

  return (
    <TooltipProvider>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            ref={triggerRef}
            variant="ghost"
            label={current.replace("{{mode}}", modes[theme])}
          >
            <SwapIcon value={theme} options={THEME_OPTIONS} />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel id={labelId}>{label}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            aria-labelledby={labelId}
            value={theme}
            onValueChange={(value) => {
              if (isThemePreference(value)) void changeTheme(value, triggerRef.current);
            }}
          >
            {THEME_OPTIONS.map(({ value, icon: Icon }) => (
              <DropdownMenuRadioItem key={value} value={value}>
                <Icon />
                {modes[value]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
