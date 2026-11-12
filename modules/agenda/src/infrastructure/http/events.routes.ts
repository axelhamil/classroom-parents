import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { timeIdCursorSchema } from "@packages/http/time-id-cursor";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { z } from "zod";
import { editEventBodySchema, eventIdParamSchema } from "../../application/dto/event.dto";
import { eventNotFound } from "../../application/ports/event-repository.port";
import type { EventEditService } from "../../application/services/event-edit.service";
import type { EventQueryService } from "../../application/services/event-query.service";
import { eventCategorySchema } from "../../domain/value-objects/event-category.vo";
import { eventStatusSchema } from "../../domain/value-objects/event-status.vo";

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

function oneOrMany<T extends z.ZodType>(item: T) {
  return z.preprocess(
    (value) => (value === undefined || Array.isArray(value) ? value : [value]),
    z.array(item).optional(),
  );
}

const listEventsQuerySchema = z.object({
  scope: z.enum(["upcoming", "history"]).default("upcoming"),
  category: oneOrMany(eventCategorySchema),
  childId: oneOrMany(z.uuid()),
  status: oneOrMany(eventStatusSchema),
  done: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  cursor: timeIdCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export interface EventsRoutesDeps {
  routeGuards: RouteGuards;
  EventQueryService: Pick<EventQueryService, "listUpcoming" | "listHistory" | "get">;
  EventEditService: Pick<EventEditService, "edit" | "confirm" | "markDone" | "remove">;
}

export function createEventsRoutes(deps: EventsRoutesDeps) {
  const { routeGuards: g, EventQueryService: query, EventEditService: edits } = deps;

  return new Hono<RouteEnv>()
    .get("/", g.requireAuth, zV("query", listEventsQuerySchema), async (c) => {
      const { scope, category, childId, status, done, cursor, limit } = c.req.valid("query");
      const filter = {
        categories: category,
        childIds: childId,
        statuses: status,
        done,
        cursor,
        limit,
      };
      const userId = g.currentUserId(c);
      const now = new Date();
      const result =
        scope === "history"
          ? await query.listHistory(userId, filter, now)
          : await query.listUpcoming(userId, filter, now);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .get("/:id", g.requireAuth, zV("param", eventIdParamSchema), async (c) => {
      const result = await query.get(g.currentUserId(c), c.req.valid("param").id);
      if (result.isFailure) throw new AppErrorException(result.getError());
      if (result.getValue().isNone()) throw new AppErrorException(eventNotFound);
      return c.json(result.getValue().unwrap());
    })
    .patch(
      "/:id",
      g.requireAuth,
      zV("param", eventIdParamSchema),
      zV("json", editEventBodySchema),
      async (c) => {
        const result = await edits.edit(
          g.currentUserId(c),
          c.req.valid("param").id,
          c.req.valid("json"),
        );
        if (result.isFailure) throw new AppErrorException(result.getError());
        return c.json(result.getValue());
      },
    )
    .post("/:id/confirm", g.requireAuth, zV("param", eventIdParamSchema), async (c) => {
      const result = await edits.confirm(g.currentUserId(c), c.req.valid("param").id);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .post("/:id/done", g.requireAuth, zV("param", eventIdParamSchema), async (c) => {
      const result = await edits.markDone(g.currentUserId(c), c.req.valid("param").id, true);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .delete("/:id/done", g.requireAuth, zV("param", eventIdParamSchema), async (c) => {
      const result = await edits.markDone(g.currentUserId(c), c.req.valid("param").id, false);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .delete("/:id", g.requireAuth, zV("param", eventIdParamSchema), async (c) => {
      const result = await edits.remove(g.currentUserId(c), c.req.valid("param").id);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.body(null, 204);
    });
}
