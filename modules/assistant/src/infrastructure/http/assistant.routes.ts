import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import {
  extractionBodySchema,
  languageAndRegionBodySchema,
} from "../../application/dto/preferences.dto";
import type { PreferenceService } from "../../application/services/preference.service";

export interface AssistantRoutesDeps {
  routeGuards: RouteGuards;
  PreferenceService: Pick<
    PreferenceService,
    "preferences" | "chooseLanguageAndRegion" | "setExtraction"
  >;
}

export function createAssistantRoutes(deps: AssistantRoutesDeps) {
  const { routeGuards: g, PreferenceService: preferences } = deps;

  return new Hono<RouteEnv>()
    .get("/preferences", g.requireAuth, async (c) => {
      const result = await preferences.preferences(g.currentUserId(c));
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .put(
      "/preferences/language-and-region",
      g.requireAuth,
      zV("json", languageAndRegionBodySchema),
      async (c) => {
        const result = await preferences.chooseLanguageAndRegion(
          g.currentUserId(c),
          c.req.valid("json"),
        );
        if (result.isFailure) throw new AppErrorException(result.getError());
        return c.json(result.getValue());
      },
    )
    .put("/preferences/extraction", g.requireAuth, zV("json", extractionBodySchema), async (c) => {
      const result = await preferences.setExtraction(
        g.currentUserId(c),
        c.req.valid("json").enabled,
      );
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    });
}
