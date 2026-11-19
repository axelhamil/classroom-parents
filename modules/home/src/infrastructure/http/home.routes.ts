import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { homeLayoutBodySchema, homeNoteBodySchema } from "../../application/dto/home.dto";
import type { HomeService } from "../../application/services/home.service";

export interface HomeRoutesDeps {
  routeGuards: RouteGuards;
  HomeService: Pick<HomeService, "layout" | "setLayout" | "note" | "setNote">;
}

export function createHomeRoutes(deps: HomeRoutesDeps) {
  const { routeGuards: g, HomeService: home } = deps;

  return new Hono<RouteEnv>()
    .get("/layout", g.requireAuth, async (c) => {
      const result = await home.layout(g.currentUserId(c));
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .put("/layout", g.requireAuth, zV("json", homeLayoutBodySchema), async (c) => {
      const result = await home.setLayout(g.currentUserId(c), c.req.valid("json"));
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .get("/note", g.requireAuth, async (c) => {
      const result = await home.note(g.currentUserId(c));
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .put("/note", g.requireAuth, zV("json", homeNoteBodySchema), async (c) => {
      const result = await home.setNote(g.currentUserId(c), c.req.valid("json").body);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    });
}
