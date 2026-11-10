import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { eventRemindersParamSchema, remindersBodySchema } from "../../application/dto/reminder.dto";
import type { ReminderSettingsService } from "../../application/services/reminder-settings.service";

export interface AlertsRoutesDeps {
  routeGuards: RouteGuards;
  ReminderSettingsService: Pick<
    ReminderSettingsService,
    "eventReminders" | "customizeEvent" | "resetEvent"
  >;
}

export function createAlertsRoutes(deps: AlertsRoutesDeps) {
  const { routeGuards: g, ReminderSettingsService: settings } = deps;

  return new Hono<RouteEnv>()
    .get(
      "/:eventId/reminders",
      g.requireAuth,
      zV("param", eventRemindersParamSchema),
      async (c) => {
        const result = await settings.eventReminders(
          g.currentUserId(c),
          c.req.valid("param").eventId,
        );
        if (result.isFailure) throw new AppErrorException(result.getError());
        return c.json(result.getValue());
      },
    )
    .put(
      "/:eventId/reminders",
      g.requireAuth,
      zV("param", eventRemindersParamSchema),
      zV("json", remindersBodySchema),
      async (c) => {
        const result = await settings.customizeEvent(
          g.currentUserId(c),
          c.req.valid("param").eventId,
          c.req.valid("json").reminders,
        );
        if (result.isFailure) throw new AppErrorException(result.getError());
        return c.json(result.getValue());
      },
    )
    .delete(
      "/:eventId/reminders",
      g.requireAuth,
      zV("param", eventRemindersParamSchema),
      async (c) => {
        const result = await settings.resetEvent(g.currentUserId(c), c.req.valid("param").eventId);
        if (result.isFailure) throw new AppErrorException(result.getError());
        return c.body(null, 204);
      },
    );
}
