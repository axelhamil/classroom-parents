import { createEventsRoutes } from "@modules/agenda/infrastructure/http/events.routes";
import { createAlertsRoutes } from "@modules/alerts/infrastructure/http/alerts.routes";
import { createPushRoutes } from "@modules/alerts/infrastructure/http/push.routes";
import { createRemindersRoutes } from "@modules/alerts/infrastructure/http/reminders.routes";
import { createCalendarRoutes } from "@modules/calendar-feed/infrastructure/http/calendar.routes";
import { createCalendarFeedRoutes } from "@modules/calendar-feed/infrastructure/http/calendar-feed.routes";
import { createChildrenRoutes } from "@modules/children/infrastructure/http/children.routes";
import { createClassroomSyncRoutes } from "@modules/classroom-sync/infrastructure/http/sync.routes";
import { Option } from "@packages/ddd-kit";
import type { RouteGuard } from "@packages/http/route-guards";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { auth } from "./auth";
import { routeGuards } from "./composition/route-guards";
import { di } from "./container";
import { healthRoutes } from "./modules/health/routes";
import { createRgpdRoutes } from "./modules/rgpd/routes";
import { env, FRONT_ORIGINS } from "./shared/env";
import { createInternalRoutes } from "./shared/internal-routes/internal.routes";
import { type AuthVariables, sessionMiddleware } from "./shared/middleware/auth.middleware";
import { calendarFeedRateLimit, globalRateLimit } from "./shared/middleware/calendar-rate-limit";
import { requireCsrf } from "./shared/middleware/csrf.middleware";
import { createErrorHandler } from "./shared/middleware/error.middleware";
import { httpLogger } from "./shared/middleware/logger.middleware";
import { resolveClientIp } from "./shared/middleware/rate-limit.ip";
import { requireRateLimit } from "./shared/middleware/rate-limit.middleware";
import {
  ACCOUNT_DELETE_POLICY,
  AUTH_SEND_VERIFICATION_POLICY,
  AUTH_SIGN_IN_POLICY,
  AUTH_SIGN_UP_POLICY,
  AUTH_VERIFY_EMAIL_POLICY,
  INTERNAL_CLOCK_POLICY,
  type PolicyConfig,
} from "./shared/middleware/rate-limit.policies";
import { runWithRequestContext } from "./shared/request-context";
import { createUserStreamRoutes } from "./shared/stream/user-stream.routes";

type AppEnv = {
  Variables: AuthVariables & {
    requestId: string;
  };
};

const app = new Hono<AppEnv>();

const routeDeps = di.scope(
  {
    routeGuards: () => routeGuards,
    accountDeleteRateLimit: (c): RouteGuard =>
      requireRateLimit(
        { limiter: c.IRateLimiter, outbox: c.IOutboxRepository },
        ACCOUNT_DELETE_POLICY,
      ),
    calendarFeedRateLimit: (c): RouteGuard =>
      calendarFeedRateLimit({ limiter: c.IRateLimiter, outbox: c.IOutboxRepository }),
    streamMaxLifetimeMs: () => Option.fromNullable(env.STREAM_MAX_LIFETIME_MS),
  },
  { name: "routes" },
);

const allowedOrigins = FRONT_ORIGINS;

const securityRateLimit = (policy: PolicyConfig) =>
  requireRateLimit(
    {
      limiter: di.IRateLimiter,
      outbox: di.IOutboxRepository,
      captcha: { service: di.ICaptchaService, usage: di.IRateLimiter },
    },
    policy,
  );

// Cookie-authenticated mutation surfaces: every one gets the Origin check.
const CSRF_GUARDED_PATHS = [
  "/me",
  "/me/*",
  "/children",
  "/children/*",
  "/sync",
  "/sync/*",
  "/events",
  "/events/*",
  "/push",
  "/push/*",
  "/reminders",
  "/reminders/*",
  "/calendar-feed",
  "/calendar-feed/*",
] as const;

// BetterAuth's credential and token-consuming endpoints, each on its own tight,
// fail-closed policy.
const AUTH_RATE_LIMITS: ReadonlyArray<readonly [path: string, policy: PolicyConfig]> = [
  ["/sign-in/email", AUTH_SIGN_IN_POLICY],
  ["/sign-up/email", AUTH_SIGN_UP_POLICY],
  ["/send-verification-email", AUTH_SEND_VERIFICATION_POLICY],
  ["/verify-email", AUTH_VERIFY_EMAIL_POLICY],
];

app.route("/", healthRoutes);

app.use("*", requestId());
app.use("*", (c, next) => {
  let clientIp: string | undefined;
  const context = {
    requestId: c.get("requestId"),
    clientIp: () => (clientIp ??= resolveClientIp(c)),
  };

  return runWithRequestContext(context, next);
});
app.use("*", httpLogger);
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
    },
  }),
);
app.route(
  "/internal",
  createInternalRoutes({
    cronSecret: Option.fromNullable(env.CRON_SECRET),
    rateLimit: requireRateLimit(
      { limiter: di.IRateLimiter, outbox: di.IOutboxRepository },
      INTERNAL_CLOCK_POLICY,
    ),
    clock: {
      tick: () => di.ClockService.tick(),
      sweep: () => di.ClockService.sweep(),
    },
  }),
);

app.use(
  "*",
  cors({
    origin: allowedOrigins,
    credentials: true,
    // Not CORS-safelisted: without this the app, on another origin, cannot see when a
    // refusal reopens and its stream reconnects into the rate limit on its own backoff.
    exposeHeaders: ["Retry-After"],
  }),
);

app.use("*", sessionMiddleware);

app.use("*", globalRateLimit({ limiter: di.IRateLimiter }));

const csrf = requireCsrf({ outbox: di.IOutboxRepository, allowedOrigins });
for (const path of CSRF_GUARDED_PATHS) app.use(path, csrf);

for (const [path, policy] of AUTH_RATE_LIMITS) {
  app.use(`/api/auth${path}`, securityRateLimit(policy));
}

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

const routes = app
  .route("/me", createRgpdRoutes(routeDeps))
  .route("/children", createChildrenRoutes(routeDeps))
  .route("/sync", createClassroomSyncRoutes(routeDeps))
  .route("/events", createEventsRoutes(routeDeps))
  .route("/events", createAlertsRoutes(routeDeps))
  .route("/push", createPushRoutes(routeDeps))
  .route("/reminders", createRemindersRoutes(routeDeps))
  .route("/calendar-feed", createCalendarFeedRoutes(routeDeps))
  .route("/calendar", createCalendarRoutes(routeDeps))
  .route("/stream", createUserStreamRoutes(routeDeps));

app.onError(createErrorHandler(di.IInstrumentation));

export { app, routes };
export type AppType = typeof routes;
