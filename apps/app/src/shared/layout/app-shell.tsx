import { AppBar } from "@packages/ui/components/ui/app-bar";
import {
  AppNavigation,
  AppNavigationIcon,
  AppNavigationItem,
} from "@packages/ui/components/ui/app-navigation";
import { BrandLink, BrandMark } from "@packages/ui/components/ui/brand-link";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SchoolClockProvider, useLiveSchoolClock } from "../agenda/school-clock-context";
import { DeletionPendingBanner } from "../components/deletion-pending-banner";
import { NotificationBell } from "../notifications/notification-bell";
import { useReadNotificationFromLink } from "../notifications/use-read-notification-from-link";
import { OfflineBanner } from "../offline/offline-banner";
import { InstallInvite } from "../pwa/install-invite";
import { useAppBadge } from "../pwa/use-app-badge";
import { useNotificationNavigation } from "../pwa/use-notification-navigation";
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
  useNotificationNavigation();
  useReadNotificationFromLink();
  useAppBadge();
  const clock = useLiveSchoolClock(user.id);

  return (
    <div className="flex min-h-dvh flex-col pb-nav md:pb-0 print:min-h-0 print:pb-0">
      <AppBar className="justify-between lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <BrandLink asChild className="lg:justify-self-start">
          <Link to="/" viewTransition>
            <BrandMark />
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
        <div className="flex items-center gap-1 lg:justify-self-end">
          <NotificationBell />
          <UserMenu user={user} />
        </div>
      </AppBar>
      <OfflineBanner />
      <DeletionPendingBanner />
      <InstallInvite />
      <SchoolClockProvider clock={clock}>{children}</SchoolClockProvider>
    </div>
  );
}
