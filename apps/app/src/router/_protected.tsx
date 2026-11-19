import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { sessionQueryOptions } from "../shared/api/queries/session";
import { keepQueriesOffline } from "../shared/offline/query-persistence";

export const Route = createFileRoute("/_protected")({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (!session) {
      const back = location.href === "/" ? undefined : location.href;
      throw redirect({ to: "/login", search: { redirect: back } });
    }

    if (!session.user.pendingDeletionUntil)
      await keepQueriesOffline(context.queryClient, session.user.id);

    return {
      user: session.user,
      sessionId: session.session.id,
      sessionToken: session.session.token,
    };
  },
  component: Outlet,
});
