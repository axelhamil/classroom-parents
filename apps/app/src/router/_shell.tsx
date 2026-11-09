import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "../shared/layout/app-shell";

export const Route = createFileRoute("/_protected/_shell")({
  component: ShellLayout,
});

function ShellLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
