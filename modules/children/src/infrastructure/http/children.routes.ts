import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import {
  childIdParamSchema,
  editChildBodySchema,
  linkedAccountParamSchema,
  registerChildBodySchema,
} from "../../application/dto/child.dto";
import type { ChildConnectionService } from "../../application/services/child-connection.service";

export interface ChildrenRoutesDeps {
  routeGuards: RouteGuards;
  ChildConnectionService: Pick<
    ChildConnectionService,
    | "list"
    | "register"
    | "edit"
    | "disconnect"
    | "reconnect"
    | "linkable"
    | "discardLinked"
    | "linkConfig"
  >;
}

export function createChildrenRoutes(deps: ChildrenRoutesDeps) {
  const { routeGuards: g, ChildConnectionService: children } = deps;

  return new Hono<RouteEnv>()
    .get("/", g.requireAuth, async (c) => {
      const result = await children.list(g.currentUserId(c));
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .get("/linkable", g.requireAuth, async (c) => {
      const result = await children.linkable(g.currentUserId(c));
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .post(
      "/linkable/:linkedAccountId/discard",
      g.requireAuth,
      zV("param", linkedAccountParamSchema),
      async (c) => {
        const result = await children.discardLinked(
          g.currentUserId(c),
          c.req.valid("param").linkedAccountId,
        );
        if (result.isFailure) throw new AppErrorException(result.getError());
        return c.body(null, 204);
      },
    )
    .get("/link-config", g.requireAuth, (c) => c.json(children.linkConfig()))
    .post("/", g.requireAuth, zV("json", registerChildBodySchema), async (c) => {
      const result = await children.register(g.currentUserId(c), c.req.valid("json"));
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue(), 201);
    })
    .patch(
      "/:id",
      g.requireAuth,
      zV("param", childIdParamSchema),
      zV("json", editChildBodySchema),
      async (c) => {
        const result = await children.edit(
          g.currentUserId(c),
          c.req.valid("param").id,
          c.req.valid("json"),
        );
        if (result.isFailure) throw new AppErrorException(result.getError());
        return c.json(result.getValue());
      },
    )
    .delete("/:id", g.requireAuth, zV("param", childIdParamSchema), async (c) => {
      const result = await children.disconnect(g.currentUserId(c), c.req.valid("param").id);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.body(null, 204);
    })
    .post("/:id/reconnect", g.requireAuth, zV("param", childIdParamSchema), async (c) => {
      const result = await children.reconnect(g.currentUserId(c), c.req.valid("param").id);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    });
}
