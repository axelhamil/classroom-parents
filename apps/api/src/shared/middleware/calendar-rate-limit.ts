import type { RouteGuard } from "@packages/http/route-guards";
import { except } from "hono/combine";
import {
  type MissRateLimitDeps,
  type RateLimitDeps,
  requireMissRateLimit,
  requireRateLimit,
} from "./rate-limit.middleware";
import {
  CALENDAR_FEED_MISS_POLICY,
  CALENDAR_FEED_POLICY,
  GLOBAL_POLICY,
} from "./rate-limit.policies";

export const CALENDAR_FEED_PATHS = "/calendar/*";

export function globalRateLimit(deps: RateLimitDeps): RouteGuard {
  return except(CALENDAR_FEED_PATHS, requireRateLimit(deps, GLOBAL_POLICY));
}

export function calendarFeedRateLimit(deps: MissRateLimitDeps): RouteGuard {
  const misses = requireMissRateLimit(deps, CALENDAR_FEED_MISS_POLICY);
  const perFeed = requireRateLimit(deps, CALENDAR_FEED_POLICY);

  return (c, next) =>
    misses(c, async () => {
      await perFeed(c, next);
    });
}
