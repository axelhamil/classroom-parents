import type { ReactNode } from "react";
import { DeletionPendingBanner } from "../components/deletion-pending-banner";
import { useAppUserStream } from "../stream/use-app-user-stream";
import { useSyncOnOpen } from "../sync/use-sync-on-open";
import { BottomNav } from "./bottom-nav";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  useAppUserStream();
  useSyncOnOpen();

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <div className="flex min-w-0 flex-1 flex-col pb-nav md:pb-0">
        <DeletionPendingBanner />
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
