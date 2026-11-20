import { AppErrorException, Option } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
  readByRefBodySchema,
} from "../../application/dto/notification.dto";
import type { NotificationFeedService } from "../../application/services/notification-feed.service";
import { presentFeed } from "./notification.presenter";

export interface NotificationsRoutesDeps {
  routeGuards: RouteGuards;
  NotificationFeedService: Pick<
    NotificationFeedService,
    "list" | "unreadCount" | "markRead" | "markReadByRef" | "markAllRead"
  >;
}

export function createNotificationsRoutes(deps: NotificationsRoutesDeps) {
  const { routeGuards: g, NotificationFeedService: feed } = deps;

  return new Hono<RouteEnv>()
    .get("/", g.requireAuth, zV("query", listNotificationsQuerySchema), async (c) => {
      const { cursor, limit } = c.req.valid("query");
      const result = await feed.list(g.currentUserId(c), Option.fromNullable(cursor), limit);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(presentFeed(result.getValue()));
    })
    .get("/unread-count", g.requireAuth, async (c) => {
      const result = await feed.unreadCount(g.currentUserId(c));
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json({ count: result.getValue() });
    })
    .post("/read-all", g.requireAuth, async (c) => {
      const result = await feed.markAllRead(g.currentUserId(c));
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json({ count: result.getValue() });
    })
    .post("/read-by-ref", g.requireAuth, zV("json", readByRefBodySchema), async (c) => {
      const result = await feed.markReadByRef(g.currentUserId(c), c.req.valid("json").ref);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.body(null, 204);
    })
    .post("/:id/read", g.requireAuth, zV("param", notificationIdParamSchema), async (c) => {
      const result = await feed.markRead(g.currentUserId(c), c.req.valid("param").id);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.body(null, 204);
    });
}
