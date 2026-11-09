import { NavLink } from "@packages/ui/components/ui/nav-link";
import { TabBar } from "@packages/ui/components/ui/tab-bar";
import { Link, useRouterState } from "@tanstack/react-router";
import { Archive, Backpack, CalendarDays, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";

const NAV_ITEMS = [
  { to: "/", sections: ["/events"], labelKey: "nav.events", icon: CalendarDays },
  { to: "/history", sections: [], labelKey: "nav.history", icon: Archive },
  { to: "/children", sections: [], labelKey: "nav.children", icon: Backpack },
  { to: "/settings", sections: [], labelKey: "nav.settings", icon: Settings },
] as const;

function isActive(pathname: string, to: string, sections: readonly string[]): boolean {
  if (pathname === to) return true;

  return [to === "/" ? undefined : to, ...sections].some(
    (section) => section !== undefined && pathname.startsWith(`${section}/`),
  );
}

export function BottomNav() {
  const { t } = useTranslation("common");
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <TabBar aria-label={t("nav.label")} brand={t("brand")}>
      {NAV_ITEMS.map(({ to, sections, labelKey, icon: Icon }) => (
        <li key={to}>
          <NavLink variant="tab" active={isActive(pathname, to, sections)} asChild>
            <Link to={to}>
              <Icon aria-hidden />
              {t(labelKey)}
            </Link>
          </NavLink>
        </li>
      ))}
    </TabBar>
  );
}
