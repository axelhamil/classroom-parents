import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  MAX_STREAMS_PER_USER,
  type NotificationStreamHub,
} from "../services/notification-stream-hub";

export const STREAM_PING_MS = 25_000;

export interface UserStreamRoutesDeps {
  routeGuards: RouteGuards;
  NotificationStreamHub: Pick<NotificationStreamHub, "subscribe" | "subscriberCount">;
}

export function createUserStreamRoutes(deps: UserStreamRoutesDeps, pingMs = STREAM_PING_MS) {
  const { routeGuards: g, NotificationStreamHub: hub } = deps;

  return new Hono<RouteEnv>().get("/", g.requireAuth, (c) => {
    const userId = g.currentUserId(c);
    if (hub.subscriberCount(userId) >= MAX_STREAMS_PER_USER)
      throw new AppErrorException({
        code: "STREAM_RATE_LIMITED",
        message: "Too many open live streams, close another tab and retry.",
      });

    return streamSSE(c, async (stream) => {
      const unsubscribe = hub.subscribe(userId, (message) => {
        void stream.writeSSE({ data: JSON.stringify(message) });
      });
      const ping = setInterval(() => {
        void stream.writeSSE({ event: "ping", data: "" });
      }, pingMs);

      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(ping);
      unsubscribe();
    });
  });
}
