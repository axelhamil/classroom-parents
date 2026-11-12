import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { issueFeedBodySchema } from "../../application/dto/calendar-feed.dto";
import type { CalendarFeedService } from "../../application/services/calendar-feed.service";

export interface CalendarFeedRoutesDeps {
  routeGuards: RouteGuards;
  CalendarFeedService: Pick<CalendarFeedService, "status" | "issue" | "revoke">;
}

export function createCalendarFeedRoutes(deps: CalendarFeedRoutesDeps) {
  const { routeGuards: g, CalendarFeedService: feeds } = deps;

  return new Hono<RouteEnv>()
    .get("/", g.requireAuth, async (c) => {
      const result = await feeds.status(g.currentUserId(c));
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .post("/", g.requireAuth, zV("json", issueFeedBodySchema), async (c) => {
      const result = await feeds.issue(g.currentUserId(c), c.req.valid("json"));
      if (result.isFailure) throw new AppErrorException(result.getError());
      c.header("Cache-Control", "no-store");
      return c.json(result.getValue(), 201);
    })
    .delete("/", g.requireAuth, async (c) => {
      const result = await feeds.revoke(g.currentUserId(c));
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.body(null, 204);
    });
}
