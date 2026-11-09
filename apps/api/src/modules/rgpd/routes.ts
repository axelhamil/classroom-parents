import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuard, RouteGuards } from "@packages/http/route-guards";
import { Hono } from "hono";
import type { RgpdService } from "./application/services/rgpd.service";

export interface RgpdRoutesDeps {
  routeGuards: RouteGuards;
  accountDeleteRateLimit: RouteGuard;
  RgpdService: Pick<RgpdService, "requestAccountDeletion" | "cancelAccountDeletion">;
}

export function createRgpdRoutes(deps: RgpdRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .post("/delete", g.requireAuth, deps.accountDeleteRateLimit, async (c) => {
      const session = g.currentSession(c);
      const result = await deps.RgpdService.requestAccountDeletion({
        userId: session.userId,
        sessionId: session.id,
      });
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .delete("/delete", g.requireAuth, async (c) => {
      const result = await deps.RgpdService.cancelAccountDeletion({
        userId: g.currentUserId(c),
      });
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    });
}
