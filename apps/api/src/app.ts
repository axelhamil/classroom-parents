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
import { FRONT_ORIGINS } from "./shared/env";
import { type AuthVariables, sessionMiddleware } from "./shared/middleware/auth.middleware";
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
  GLOBAL_POLICY,
  type PolicyConfig,
} from "./shared/middleware/rate-limit.policies";
import { runWithRequestContext } from "./shared/request-context";

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
const CSRF_GUARDED_PATHS = ["/me", "/me/*"] as const;

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
app.use(
  "*",
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

app.use("*", sessionMiddleware);

app.use("*", requireRateLimit({ limiter: di.IRateLimiter }, GLOBAL_POLICY));

const csrf = requireCsrf({ outbox: di.IOutboxRepository, allowedOrigins });
for (const path of CSRF_GUARDED_PATHS) app.use(path, csrf);

for (const [path, policy] of AUTH_RATE_LIMITS) {
  app.use(`/api/auth${path}`, securityRateLimit(policy));
}

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

const routes = app.route("/me", createRgpdRoutes(routeDeps));

app.onError(createErrorHandler(di.IInstrumentation));

export { app, routes };
export type AppType = typeof routes;
