import { describe, expect, it } from "bun:test";
import { AppErrorException, httpStatusFromCode, Option, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import { Hono } from "hono";
import type { CalendarFeedService } from "../application/services/calendar-feed.service";
import { createCalendarRoutes } from "../infrastructure/http/calendar.routes";

const SECRET = "s".repeat(43);

function appWith(feeds: ReturnType<typeof mockPort<CalendarFeedService>>) {
  return new Hono()
    .route(
      "/calendar",
      createCalendarRoutes({
        calendarFeedRateLimit: async (_c, next) => {
          await next();
        },
        CalendarFeedService: feeds,
      }),
    )
    .onError((err, c) =>
      err instanceof AppErrorException
        ? c.json({ code: err.code }, httpStatusFromCode(err.code))
        : c.json({ code: "INTERNAL_ERROR" }, 500),
    );
}

describe("GET /calendar/:file", () => {
  it("given a live feed, then the calendar is served as private text/calendar cached 15 minutes", async () => {
    const feeds = mockPort<CalendarFeedService>();
    feeds.render.mockResolvedValue(Result.ok(Option.some("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n")));

    const response = await appWith(feeds).request(`/calendar/${SECRET}.ics`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, max-age=900");
    expect(feeds.render).toHaveBeenCalledWith(SECRET);
  });

  it("given an unknown or revoked feed, then 404", async () => {
    const feeds = mockPort<CalendarFeedService>();
    feeds.render.mockResolvedValue(Result.ok(Option.none()));

    const response = await appWith(feeds).request(`/calendar/${SECRET}.ics`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "CALENDAR_FEED_NOT_FOUND" });
  });

  it("given a path without the .ics suffix, then 404 and no feed is looked up", async () => {
    const feeds = mockPort<CalendarFeedService>();

    const response = await appWith(feeds).request(`/calendar/${SECRET}`);

    expect(response.status).toBe(404);
    expect(feeds.render).not.toHaveBeenCalled();
  });
});
