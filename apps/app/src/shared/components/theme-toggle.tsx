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
import { isThemePreference, type ThemePreference } from "@packages/web-kit/theme/theme-store";
import { useTheme } from "@packages/web-kit/theme/use-theme";
import { Moon, Sun, SunMoon } from "lucide-react";
import { type RefObject, useId, useRef } from "react";
import { useTranslation } from "react-i18next";

export const THEME_OPTIONS = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: SunMoon },
] as const satisfies readonly SwapIconOption<ThemePreference>[];

interface ThemeRadioItemsProps {
  origin: RefObject<HTMLElement | null>;
}

export function ThemeRadioItems({ origin }: ThemeRadioItemsProps) {
  const { t } = useTranslation("common");
  const { theme, changeTheme } = useTheme();
  const labelId = useId();

  return (
    <>
      <DropdownMenuLabel id={labelId}>{t("theme.label")}</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        aria-labelledby={labelId}
        value={theme}
        onValueChange={(value) => {
          if (isThemePreference(value)) void changeTheme(value, origin.current);
        }}
      >
        {THEME_OPTIONS.map(({ value, icon: Icon }) => (
          <DropdownMenuRadioItem key={value} value={value}>
            <Icon />
            {t(`theme.${value}`)}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { t } = useTranslation("common");
  const { theme } = useTheme();
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          ref={triggerRef}
          variant="ghost"
          label={t("theme.current", { mode: t(`theme.${theme}`) })}
          className={className}
        >
          <SwapIcon value={theme} options={THEME_OPTIONS} />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ThemeRadioItems origin={triggerRef} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
