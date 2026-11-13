import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { z } from "zod";
import type {
  ManualSyncOutcome,
  ManualSyncService,
} from "../../application/services/manual-sync.service";

const childParamSchema = z.object({ childId: z.uuid() });

const toBody = ({ status, retryAt }: ManualSyncOutcome) => ({
  status,
  retryAt: retryAt.toISOString(),
});

export interface ClassroomSyncRoutesDeps {
  routeGuards: RouteGuards;
  ManualSyncService: Pick<ManualSyncService, "requestAll" | "requestChild">;
}

export function createClassroomSyncRoutes(deps: ClassroomSyncRoutesDeps) {
  const { routeGuards: g, ManualSyncService: manual } = deps;

  return new Hono<RouteEnv>()
    .post("/", g.requireAuth, async (c) => {
      const result = await manual.requestAll(g.currentUserId(c));
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(toBody(result.getValue()), 202);
    })
    .post("/:childId", g.requireAuth, zV("param", childParamSchema), async (c) => {
      const result = await manual.requestChild(g.currentUserId(c), c.req.valid("param").childId);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(toBody(result.getValue()), 202);
    });
}
