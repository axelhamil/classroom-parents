import { describe, expect, it } from "bun:test";
import { AppErrorException, httpStatusFromCode } from "@packages/ddd-kit";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import { mockPort } from "@packages/test/bun";
import { Hono } from "hono";
import type { EventEditService } from "../application/services/event-edit.service";
import type { EventQueryService } from "../application/services/event-query.service";
import { createEventsRoutes } from "../infrastructure/http/events.routes";

describe("GET /events", () => {
  it.each([
    ["an id that is not a uuid", "2030-06-10 21:59:00+00~not-a-uuid"],
    [
      "an instant that does not exist",
      "2030-13-45 99:00:00+00~0196a000-0000-7000-8000-000000000001",
    ],
  ])(
    "given a cursor forged with %s, then 400 REQUEST_INVALID and the list is never read",
    async (_label, cursor) => {
      const query = mockPort<EventQueryService>();
      const app = new Hono()
        .route(
          "/events",
          createEventsRoutes({
            routeGuards: openRouteGuards({ userId: "parent-1" }),
            EventQueryService: query,
            EventEditService: mockPort<EventEditService>(),
          }),
        )
        .onError((err, c) =>
          err instanceof AppErrorException
            ? c.json({ code: err.code }, httpStatusFromCode(err.code))
            : c.json({ code: "INTERNAL_ERROR" }, 500),
        );

      const response = await app.request(`/events?cursor=${encodeURIComponent(cursor)}`);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ code: "REQUEST_INVALID" });
      expect(query.listUpcoming).not.toHaveBeenCalled();
    },
  );
});
