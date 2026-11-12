import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { sessionQueryOptions } from "../shared/api/queries/session";

export const Route = createFileRoute("/_protected")({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (!session) {
      const back = location.href === "/" ? undefined : location.href;
      throw redirect({ to: "/login", search: { redirect: back } });
    }

    return {
      user: session.user,
      sessionId: session.session.id,
      sessionToken: session.session.token,
    };
  },
  component: Outlet,
});
