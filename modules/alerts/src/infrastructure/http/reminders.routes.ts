import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { remindersBodySchema } from "../../application/dto/reminder.dto";
import type { ReminderSettingsService } from "../../application/services/reminder-settings.service";

export interface RemindersRoutesDeps {
  routeGuards: RouteGuards;
  ReminderSettingsService: Pick<ReminderSettingsService, "defaults" | "setDefaults">;
}

export function createRemindersRoutes(deps: RemindersRoutesDeps) {
  const { routeGuards: g, ReminderSettingsService: settings } = deps;

  return new Hono<RouteEnv>()
    .get("/defaults", g.requireAuth, async (c) => {
      const result = await settings.defaults(g.currentUserId(c));
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .put("/defaults", g.requireAuth, zV("json", remindersBodySchema), async (c) => {
      const result = await settings.setDefaults(g.currentUserId(c), c.req.valid("json").reminders);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    });
}
