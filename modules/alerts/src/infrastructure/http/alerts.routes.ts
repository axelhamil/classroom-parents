import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { alertEventParamSchema, userAlertBodySchema } from "../../application/dto/alert.dto";
import type { AlertPlanningService } from "../../application/services/alert-planning.service";

export interface AlertsRoutesDeps {
  routeGuards: RouteGuards;
  AlertPlanningService: Pick<AlertPlanningService, "get" | "setUserAlert" | "clear">;
}

export function createAlertsRoutes(deps: AlertsRoutesDeps) {
  const { routeGuards: g, AlertPlanningService: planning } = deps;

  return new Hono<RouteEnv>()
    .get("/:eventId/alert", g.requireAuth, zV("param", alertEventParamSchema), async (c) => {
      const result = await planning.get(g.currentUserId(c), c.req.valid("param").eventId);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json({ alert: result.getValue().toNull() });
    })
    .put(
      "/:eventId/alert",
      g.requireAuth,
      zV("param", alertEventParamSchema),
      zV("json", userAlertBodySchema),
      async (c) => {
        const result = await planning.setUserAlert(
          g.currentUserId(c),
          c.req.valid("param").eventId,
          c.req.valid("json"),
        );
        if (result.isFailure) throw new AppErrorException(result.getError());
        return c.json(result.getValue());
      },
    )
    .delete("/:eventId/alert", g.requireAuth, zV("param", alertEventParamSchema), async (c) => {
      const result = await planning.clear(g.currentUserId(c), c.req.valid("param").eventId);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.body(null, 204);
    });
}
