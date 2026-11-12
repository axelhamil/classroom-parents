import { AppBar } from "@packages/ui/components/ui/app-bar";
import {
  AppNavigation,
  AppNavigationIcon,
  AppNavigationItem,
} from "@packages/ui/components/ui/app-navigation";
import { BrandLink, BrandMark } from "@packages/ui/components/ui/brand-link";
import { Link } from "@tanstack/react-router";
import { CalendarHeart } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DeletionPendingBanner } from "../components/deletion-pending-banner";
import { usePushEndpointSync } from "../pwa/use-push-endpoint-sync";
import { useAppUserStream } from "../stream/use-app-user-stream";
import { useSyncOnOpen } from "../sync/use-sync-on-open";
import { NAV_ITEMS, useActiveNavItem } from "./nav-items";
import { type ShellUser, UserMenu } from "./user-menu";

interface AppShellProps {
  user: ShellUser & { id: string };
  sessionId: string;
  children: ReactNode;
}

export function AppShell({ user, sessionId, children }: AppShellProps) {
  const { t } = useTranslation("common");
  const active = useActiveNavItem();
  useAppUserStream();
  useSyncOnOpen();
  usePushEndpointSync(user.id, sessionId);

  return (
    <div className="flex min-h-dvh flex-col pb-nav md:pb-0">
      <AppBar className="justify-between lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <BrandLink asChild className="lg:justify-self-start">
          <Link to="/" viewTransition>
            <BrandMark>
              <CalendarHeart />
            </BrandMark>
            {t("brand")}
          </Link>
        </BrandLink>
        <AppNavigation aria-label={t("nav.label")} data-tour="home-nav">
          {NAV_ITEMS.map(({ to, labelKey, icon: Icon }) => (
            <li key={to}>
              <AppNavigationItem asChild>
                <Link to={to} aria-current={active === to ? "page" : undefined} viewTransition>
                  <AppNavigationIcon>
                    <Icon />
                  </AppNavigationIcon>
                  {t(labelKey)}
                </Link>
              </AppNavigationItem>
            </li>
          ))}
        </AppNavigation>
        <UserMenu user={user} className="lg:justify-self-end" />
      </AppBar>
      <DeletionPendingBanner />
      {children}
    </div>
  );
}
