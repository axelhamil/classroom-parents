import { createHash, timingSafeEqual } from "node:crypto";
import { AppErrorException, type Option } from "@packages/ddd-kit";
import type { RouteGuard } from "@packages/http/route-guards";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { ClockReport } from "../../workers/clock";

export interface InternalRoutesDeps {
  cronSecret: Option<string>;
  rateLimit: RouteGuard;
  clock: {
    tick: () => Promise<ClockReport>;
    sweep: () => Promise<ClockReport>;
  };
}

const BEARER = /^Bearer (.+)$/;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function matchesSecret(header: string | undefined, secret: string): boolean {
  const presented = BEARER.exec(header ?? "")?.[1];
  if (presented === undefined) return false;

  return timingSafeEqual(digest(presented), digest(secret));
}

function unauthorized(): AppErrorException {
  return new AppErrorException({
    code: "CRON_UNAUTHORIZED",
    message: "Send the clock secret as an Authorization: Bearer header.",
  });
}

export function createInternalRoutes(deps: InternalRoutesDeps) {
  const enabled = createMiddleware(async (c, next) => {
    if (deps.cronSecret.isNone()) return c.notFound();

    await next();
  });

  const authorized = createMiddleware(async (c, next) => {
    const secret = deps.cronSecret.unwrapOr("");
    if (matchesSecret(c.req.header("Authorization"), secret)) return next();

    await deps.rateLimit(c, async () => {
      throw unauthorized();
    });
  });

  const answer = (report: ClockReport) => (report.ok ? 200 : 500);

  return new Hono()
    .use("*", enabled, authorized)
    .on(["GET", "POST"], "/tick", async (c) => {
      const report = await deps.clock.tick();
      return c.json(report, answer(report));
    })
    .on(["GET", "POST"], "/sweep", async (c) => {
      const report = await deps.clock.sweep();
      return c.json(report, answer(report));
    });
}
