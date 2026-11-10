import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import type { AlertsSettings } from "../../application/config/alerts-settings";
import {
  type PushConfigDto,
  pushEndpointBodySchema,
  pushSubscriptionBodySchema,
} from "../../application/dto/push-subscription.dto";
import type { PushSubscriptionService } from "../../application/services/push-subscription.service";

const USER_AGENT_MAX = 512;

export interface PushRoutesDeps {
  routeGuards: RouteGuards;
  PushSubscriptionService: Pick<PushSubscriptionService, "subscribe" | "unsubscribe" | "status">;
  alertsSettings: Pick<AlertsSettings, "vapidPublicKey">;
}

export function createPushRoutes(deps: PushRoutesDeps) {
  const { routeGuards: g, PushSubscriptionService: subscriptions, alertsSettings } = deps;

  return new Hono<RouteEnv>()
    .post("/subscriptions", g.requireAuth, zV("json", pushSubscriptionBodySchema), async (c) => {
      const result = await subscriptions.subscribe(g.currentUserId(c), {
        ...c.req.valid("json"),
        userAgent: c.req.header("user-agent")?.slice(0, USER_AGENT_MAX),
      });
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.body(null, 204);
    })
    .delete("/subscriptions", g.requireAuth, zV("json", pushEndpointBodySchema), async (c) => {
      const result = await subscriptions.unsubscribe(
        g.currentUserId(c),
        c.req.valid("json").endpoint,
      );
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.body(null, 204);
    })
    .get("/status", g.requireAuth, async (c) => {
      const result = await subscriptions.status(g.currentUserId(c));
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .get("/config", g.requireAuth, (c) => {
      const config: PushConfigDto = { vapidPublicKey: alertsSettings.vapidPublicKey };
      return c.json(config);
    });
}
