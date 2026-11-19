import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import {
  schoolCalendarQuerySchema,
  schoolZoneBodySchema,
} from "../../application/dto/school-calendar.dto";
import type { SchoolCalendarService } from "../../application/services/school-calendar.service";

export interface SchoolCalendarRoutesDeps {
  routeGuards: RouteGuards;
  SchoolCalendarService: Pick<SchoolCalendarService, "calendar" | "zone" | "setZone">;
}

export function createSchoolCalendarRoutes(deps: SchoolCalendarRoutesDeps) {
  const { routeGuards: g, SchoolCalendarService: calendars } = deps;

  return new Hono<RouteEnv>()
    .get("/", g.requireAuth, zV("query", schoolCalendarQuerySchema), async (c) => {
      const result = await calendars.calendar(g.currentUserId(c), c.req.valid("query"));
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .get("/zone", g.requireAuth, async (c) => {
      const result = await calendars.zone(g.currentUserId(c));
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .put("/zone", g.requireAuth, zV("json", schoolZoneBodySchema), async (c) => {
      const result = await calendars.setZone(g.currentUserId(c), c.req.valid("json").zone);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    });
}
