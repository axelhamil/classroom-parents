import {
  CommandPaletteDialog,
  type CommandPaletteEntry,
  type CommandPaletteGroup,
  useEntryShortcuts,
  useTogglePaletteShortcut,
} from "@packages/ui/components/ui/command-palette";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { useTheme } from "@packages/web-kit/theme/use-theme";
import { useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import {
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SIGN_OUT_SHORTCUT, useSignOut } from "../auth/use-sign-out";
import { LEGAL_ROUTES } from "../legal-routes";

interface NavigationRoute {
  to: string;
  labelKey: "nav.dashboard" | "commandPalette.nav.privacy";
  icon: LucideIcon;
}

const NAVIGATION_ROUTES: readonly NavigationRoute[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { to: "/settings/privacy", labelKey: "commandPalette.nav.privacy", icon: ShieldCheck },
];

function useNavigationGroup(t: TFunction<"common">): CommandPaletteGroup {
  const navigate = useNavigate();

  return {
    heading: t("commandPalette.groups.navigate"),
    items: NAVIGATION_ROUTES.map((route) => ({
      id: `nav:${route.to}`,
      label: t(route.labelKey),
      icon: route.icon,
      run: () => navigate({ to: route.to }),
    })),
  };
}

function useLegalGroup(t: TFunction<"common">): CommandPaletteGroup {
  const navigate = useNavigate();
  return {
    heading: t("commandPalette.groups.legal"),
    items: LEGAL_ROUTES.map((route) => ({
      id: `legal:${route.to}`,
      label: t(route.labelKey),
      icon: route.icon,
      run: () => navigate({ to: route.to }),
    })),
  };
}

function themeOptionsFor(t: TFunction<"common">) {
  return [
    { value: "light", label: t("commandPalette.theme.light"), icon: Sun },
    { value: "dark", label: t("commandPalette.theme.dark"), icon: Moon },
    { value: "system", label: t("commandPalette.theme.system"), icon: Monitor },
  ] as const;
}

function useActionsGroup(t: TFunction<"common">): CommandPaletteGroup {
  const { setTheme, theme } = useTheme();
  const signOut = useSignOut();
  const themeOptions = themeOptionsFor(t);

  const items: CommandPaletteEntry[] = themeOptions.map((option) => ({
    id: `theme:${option.value}`,
    label: option.label,
    icon: option.icon,
    hint: theme === option.value ? t("commandPalette.theme.active") : undefined,
    run: () => setTheme(option.value),
  }));

  items.push({
    id: "action:sign-out",
    label: t("userMenu.signOut"),
    icon: LogOut,
    shortcut: SIGN_OUT_SHORTCUT,
    run: () => signOut.mutate(),
  });

  return { heading: t("commandPalette.groups.actions"), items };
}

function useCommandGroups(t: TFunction<"common">): CommandPaletteGroup[] {
  const navigation = useNavigationGroup(t);
  const legal = useLegalGroup(t);
  const actions = useActionsGroup(t);

  return [navigation, legal, actions];
}

export function CommandPalette() {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const groups = useCommandGroups(t);
  const onEntryFailed = (err: unknown) => toastError(err, t("commandPalette.actionFailed"));
  useTogglePaletteShortcut(setOpen);
  useEntryShortcuts(groups, onEntryFailed);

  return (
    <CommandPaletteDialog
      open={open}
      onOpenChange={setOpen}
      groups={groups}
      title={t("commandPalette.title")}
      description={t("commandPalette.description")}
      closeLabel={t("actions.close")}
      searchPlaceholder={t("commandPalette.searchPlaceholder")}
      emptyLabel={t("commandPalette.noResults")}
      onEntryFailed={onEntryFailed}
    />
  );
}
