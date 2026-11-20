import { AppErrorException, type Result } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuard, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import {
  choiceBodySchema,
  icsImportBodySchema,
  periodBodySchema,
  periodParamSchema,
  previewQuerySchema,
  regionsQuerySchema,
  schoolCalendarQuerySchema,
} from "../../application/dto/school-calendar.dto";
import type { SchoolCalendarError } from "../../application/errors/school-calendar-errors";
import type { CalendarChoiceService } from "../../application/services/calendar-choice.service";
import type { SchoolCalendarService } from "../../application/services/school-calendar.service";

export interface SchoolCalendarRoutesDeps {
  routeGuards: RouteGuards;
  icsImportRateLimit: RouteGuard;
  SchoolCalendarService: Pick<
    SchoolCalendarService,
    "calendar" | "settings" | "regions" | "preview"
  >;
  CalendarChoiceService: Pick<
    CalendarChoiceService,
    "choose" | "addPeriod" | "removePeriod" | "importIcs"
  >;
}

function answered<T>(result: Result<T, SchoolCalendarError>): T {
  if (result.isFailure) throw new AppErrorException(result.getError());

  return result.getValue();
}

export function createSchoolCalendarRoutes(deps: SchoolCalendarRoutesDeps) {
  const { routeGuards: g, SchoolCalendarService: calendars, CalendarChoiceService: choices } = deps;

  return new Hono<RouteEnv>()
    .get("/", g.requireAuth, zV("query", schoolCalendarQuerySchema), async (c) =>
      c.json(answered(await calendars.calendar(g.currentUserId(c), c.req.valid("query")))),
    )
    .get("/settings", g.requireAuth, async (c) =>
      c.json(answered(await calendars.settings(g.currentUserId(c)))),
    )
    .get("/regions", g.requireAuth, zV("query", regionsQuerySchema), async (c) => {
      const regions = await calendars.regions(g.currentUserId(c), c.req.valid("query").country);
      return c.json({ regions: answered(regions) });
    })
    .get("/preview", g.requireAuth, zV("query", previewQuerySchema), async (c) =>
      c.json(answered(await calendars.preview(g.currentUserId(c), c.req.valid("query")))),
    )
    .put("/choice", g.requireAuth, zV("json", choiceBodySchema), async (c) => {
      const choice = await choices.choose(g.currentUserId(c), c.req.valid("json").choice);
      return c.json({ choice: answered(choice) });
    })
    .post("/periods", g.requireAuth, zV("json", periodBodySchema), async (c) => {
      answered(await choices.addPeriod(g.currentUserId(c), c.req.valid("json")));
      return c.body(null, 204);
    })
    .delete("/periods/:id", g.requireAuth, zV("param", periodParamSchema), async (c) => {
      answered(await choices.removePeriod(g.currentUserId(c), c.req.valid("param").id));
      return c.body(null, 204);
    })
    .post(
      "/periods/import",
      g.requireAuth,
      deps.icsImportRateLimit,
      zV("json", icsImportBodySchema),
      async (c) =>
        c.json(answered(await choices.importIcs(g.currentUserId(c), c.req.valid("json")))),
    );
}
