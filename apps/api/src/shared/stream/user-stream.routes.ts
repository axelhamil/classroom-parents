import { AppErrorException, type Option } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { raceWithTimeout } from "@packages/outbox/race-with-timeout";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  MAX_STREAMS_PER_USER,
  type NotificationStreamHub,
} from "../services/notification-stream-hub";

export const STREAM_PING_MS = 25_000;

export interface UserStreamRoutesDeps {
  routeGuards: RouteGuards;
  NotificationStreamHub: Pick<NotificationStreamHub, "subscribe" | "subscriberCount" | "start">;
  streamMaxLifetimeMs: Option<number>;
}

export function createUserStreamRoutes(deps: UserStreamRoutesDeps, pingMs = STREAM_PING_MS) {
  const { routeGuards: g, NotificationStreamHub: hub } = deps;

  return new Hono<RouteEnv>().get("/", g.requireAuth, async (c) => {
    const userId = g.currentUserId(c);
    if (hub.subscriberCount(userId) >= MAX_STREAMS_PER_USER)
      throw new AppErrorException({
        code: "STREAM_RATE_LIMITED",
        message: "Too many open live streams, close another tab and retry.",
      });

    await hub.start();

    return streamSSE(c, async (stream) => {
      const unsubscribe = hub.subscribe(userId, (message) => {
        void stream.writeSSE({ data: JSON.stringify(message) });
      });
      const ping = setInterval(() => {
        void stream.writeSSE({ event: "ping", data: "" });
      }, pingMs);

      const aborted = new Promise<void>((resolve) => stream.onAbort(resolve));
      await deps.streamMaxLifetimeMs
        .map((lifetimeMs) => raceWithTimeout(aborted, lifetimeMs, () => undefined))
        .unwrapOr(aborted);
      clearInterval(ping);
      unsubscribe();
    });
  });
}
