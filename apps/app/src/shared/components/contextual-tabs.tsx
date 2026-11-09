import { NavLink } from "@packages/ui/components/ui/nav-link";
import { cn } from "@packages/ui/libs/utils.js";
import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

interface TabItem {
  to: string;
  labelKey: "contextualTabs.privacy";
  icon?: LucideIcon;
}

const SETTINGS_TABS: readonly TabItem[] = [
  { to: "/settings/privacy", labelKey: "contextualTabs.privacy" },
];

interface ContextualTabsProps {
  className?: string;
}

export function ContextualTabs({ className }: ContextualTabsProps) {
  const { t } = useTranslation("common");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeIndex = SETTINGS_TABS.findIndex((tab) => tab.to === pathname);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    navRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeIndex]);

  return (
    <nav
      ref={navRef}
      aria-label={t("contextualTabs.ariaLabel")}
      className={cn("scrollbar-none flex items-center gap-1 overflow-x-auto", className)}
    >
      {SETTINGS_TABS.map((tab) => {
        const Icon = tab.icon;
        return (
          <NavLink key={tab.to} variant="underline" active={pathname === tab.to} asChild>
            <Link to={tab.to} className="gap-1.5">
              {Icon && <Icon className="size-3.5" />}
              {t(tab.labelKey)}
            </Link>
          </NavLink>
        );
      })}
    </nav>
  );
}
