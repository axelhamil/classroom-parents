import { ChildIcon, HomeIcon, SettingsIcon } from "@packages/ui/components/ui/icons";
import { useRouterState } from "@tanstack/react-router";

export const NAV_ITEMS = [
  { to: "/", sections: ["/events", "/history"], labelKey: "nav.home", icon: HomeIcon },
  { to: "/children", sections: ["/children"], labelKey: "nav.children", icon: ChildIcon },
  { to: "/settings", sections: ["/settings"], labelKey: "nav.settings", icon: SettingsIcon },
] as const;

function isActive(pathname: string, to: string, sections: readonly string[]): boolean {
  if (pathname === to) return true;

  return sections.some((section) => pathname === section || pathname.startsWith(`${section}/`));
}

export function useActiveNavItem(): (typeof NAV_ITEMS)[number]["to"] | null {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return NAV_ITEMS.find(({ to, sections }) => isActive(pathname, to, sections))?.to ?? null;
}
