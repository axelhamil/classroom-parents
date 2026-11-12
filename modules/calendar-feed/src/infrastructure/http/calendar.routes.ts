import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuard } from "@packages/http/route-guards";
import { Hono } from "hono";
import type { CalendarFeedError } from "../../application/ports/calendar-feed-repository.port";
import type { CalendarFeedService } from "../../application/services/calendar-feed.service";

const FEED_SUFFIX = ".ics";

const feedNotFound: CalendarFeedError = {
  code: "CALENDAR_FEED_NOT_FOUND",
  message: "Ce lien d'agenda n'existe pas ou a été révoqué. Créez un nouveau lien dans Réglages.",
};

export interface CalendarRoutesDeps {
  calendarFeedRateLimit: RouteGuard;
  CalendarFeedService: Pick<CalendarFeedService, "render">;
}

export function createCalendarRoutes(deps: CalendarRoutesDeps) {
  const { CalendarFeedService: feeds } = deps;

  return new Hono<RouteEnv>().get("/:file", deps.calendarFeedRateLimit, async (c) => {
    const file = c.req.param("file");
    if (!file.endsWith(FEED_SUFFIX)) throw new AppErrorException(feedNotFound);

    const rendered = await feeds.render(file.slice(0, -FEED_SUFFIX.length));
    if (rendered.isFailure) throw new AppErrorException(rendered.getError());
    if (rendered.getValue().isNone()) throw new AppErrorException(feedNotFound);

    return c.body(rendered.getValue().unwrap(), 200, {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=900",
    });
  });
}
