import "zod/v4/core";
import { db } from "@packages/drizzle";
import type { EmailTemplates, TemplateVariables } from "@packages/email/email.port";
import { type EventType, EventTypes } from "@packages/events";
import { emitEvent, emitEventBestEffort } from "@packages/outbox/event-emitter";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { CryptoHasher } from "bun";
import { findLatestLinkedAccount } from "./auth-queries";
import { di } from "./container";
import { asUnitOfWork } from "./shared/auth/unit-of-work-adapter";
import { env, FRONT_ORIGINS } from "./shared/env";
import { logger } from "./shared/logger";
import { getClientIp } from "./shared/request-context";

const isProd = env.NODE_ENV === "production";
const MIN_PASSWORD_LENGTH = 15;

/**
 * Derives a stable idempotency key from an opaque BetterAuth token so that
 * retried email sends don't produce duplicate deliveries. The token is hashed
 * to avoid storing a verifiable secret in provider logs.
 */
function tokenIdempotencyKey(template: string, token: string): string {
  const hash = new CryptoHasher("sha256").update(token).digest("hex").slice(0, 32);
  return `${template}/${hash}`;
}

async function emit<TPayload>(
  eventType: EventType,
  aggregateType: string,
  aggregateId: string,
  payload: TPayload,
): Promise<void> {
  await emitEvent(di.IOutboxRepository, eventType, aggregateType, aggregateId, payload);
}

/**
 * Sends a transactional email through `IEmailService` and surfaces failures
 * as a thrown `Error`, the only signal available inside BetterAuth's
 * `async () => void` hook signature. Transport-not-configured is downgraded
 * to a warning (dev/test without Resend configured should not crash).
 */
async function dispatchEmail<K extends keyof EmailTemplates>(
  template: K,
  to: string,
  variables: EmailTemplates[K] & TemplateVariables,
  idempotencyKey: string,
): Promise<void> {
  const result = await di.IEmailService.sendTemplate(template, to, variables, { idempotencyKey });
  if (result.isFailure) {
    const error = result.getError();
    if (error.code === "EMAIL_PROVIDER_FAILURE") {
      throw new Error(`email send failed (${template}): ${error.message}`);
    }
    logger.warn({ template, to, code: error.code }, "email skipped, transport not configured");
  }
}

const authOptions = {
  appName: "classroom-parents",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  secrets: env.BETTER_AUTH_SECRETS,
  rateLimit: { enabled: false },

  // The adapter gets `db` wrapped so every transaction it opens is an outermost unit
  // of work: the hooks it runs inside read it through `resolveExecutor()` and their
  // events are flushed before it commits.
  database: drizzleAdapter(
    asUnitOfWork(db, () => di.ITransactionService),
    { provider: "pg", transaction: true },
  ),

  user: {
    additionalFields: {
      pendingDeletionUntil: { type: "date", required: false, returned: true, input: false },
      deletedAt: { type: "date", required: false, returned: false, input: false },
    },
  },

  trustedOrigins: FRONT_ORIGINS,

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, token }) => {
      const verifyUrl = `${env.APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
      await dispatchEmail(
        "verify_email",
        user.email,
        { name: user.name ?? "", verifyUrl },
        tokenIdempotencyKey("verify-email", token),
      );
    },
  },

  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60,
    },
  },

  advanced: {
    ...(env.AUTH_COOKIE_DOMAIN
      ? { crossSubDomainCookies: { enabled: true, domain: env.AUTH_COOKIE_DOMAIN } }
      : {}),
    defaultCookieAttributes: {
      httpOnly: true,
      secure: isProd,
      // "none" in prod: SPA and API are cross-origin (decoupled deploy), the session
      // cookie must ride cross-site fetch. CSRF is covered in-app by requireCsrf, not SameSite.
      sameSite: isProd ? "none" : "lax",
    },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;

      // Credential stuffing: per-account rate limit on sign-in (fail-closed, store error → 503).
      const email = (ctx.body as Record<string, unknown> | undefined)?.email;
      if (typeof email !== "string") return;

      const rl = await di.IRateLimiter.consume(`auth-sign-in:account:${email}`, [
        {
          policyName: "auth-sign-in-account",
          windowSec: env.AUTH_SIGN_IN_ACCOUNT_WINDOW_SEC,
          maxRequests: env.AUTH_SIGN_IN_ACCOUNT_MAX,
        },
      ]);
      if (rl.isFailure) {
        throw new APIError("SERVICE_UNAVAILABLE", { message: "Service temporarily unavailable" });
      }

      const decision = rl.getValue();
      if (decision.allowed) return;

      if (decision.firstBlock) {
        await emitEventBestEffort(
          di.IOutboxRepository,
          logger,
          EventTypes.SECURITY_RATE_LIMIT_EXCEEDED,
          "rate_limit",
          `auth-sign-in-account:${email}`,
          {
            actorUserId: null,
            ip: getClientIp() ?? "unknown",
            policyName: "auth-sign-in-account",
            path: ctx.path,
            method: "POST",
          },
          "security event emit failed, still refusing the request",
          { eventType: EventTypes.SECURITY_RATE_LIMIT_EXCEEDED },
        );
      }
      throw new APIError("TOO_MANY_REQUESTS", { message: "Too many login attempts" });
    }),

    after: createAuthMiddleware(async (ctx) => {
      const path = ctx.path;
      const body = ctx.body as Record<string, unknown> | undefined;

      if (path === "/verify-email") {
        const verified = ctx.context.newSession?.user;
        if (verified?.emailVerified) {
          await emit(EventTypes.USER_EMAIL_VERIFIED, "user", verified.id, {
            userId: verified.id,
            email: verified.email,
          });
        }
        return;
      }

      const userId = ctx.context.session?.user.id;
      if (!userId) return;

      if (path === "/update-user") {
        const changes: Record<string, unknown> = {};
        if (typeof body?.name === "string") changes.name = body.name;
        if (typeof body?.image === "string") changes.image = body.image;
        await emit(EventTypes.USER_PROFILE_UPDATED, "user", userId, { userId, changes });
        return;
      }

      if (path === "/link-social") {
        const latest = await findLatestLinkedAccount(userId);
        const recentEnough = latest?.createdAt && Date.now() - latest.createdAt.getTime() < 5_000;
        if (latest && latest.providerId !== "credential" && recentEnough) {
          await emit(EventTypes.USER_ACCOUNT_LINKED, "account", latest.id, {
            userId,
            providerId: latest.providerId,
            accountId: latest.accountId,
          });
        }
      }
    }),
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await emit(EventTypes.USER_CREATED, "user", user.id, {
            userId: user.id,
            email: user.email,
            name: user.name,
          });
        },
      },
    },
    session: {
      create: {
        // BetterAuth fills ipAddress from raw X-Forwarded-For; keep the trusted-proxy value instead.
        before: async (session) => ({ data: { ...session, ipAddress: getClientIp() ?? null } }),
        after: async (session) => {
          await emit(EventTypes.USER_SIGNED_IN, "session", session.id, {
            userId: session.userId,
            sessionId: session.id,
            ipAddress: session.ipAddress ?? undefined,
            userAgent: session.userAgent ?? undefined,
          });
        },
      },
    },
    account: {
      delete: {
        after: async (account) => {
          if (account.providerId === "credential") return;
          await emit(EventTypes.USER_ACCOUNT_UNLINKED, "account", account.id, {
            userId: account.userId,
            providerId: account.providerId,
            accountId: account.accountId,
          });
        },
      },
    },
  },
} satisfies BetterAuthOptions;

export const auth = betterAuth(authOptions);

export type SessionUser = typeof auth.$Infer.Session.user;
export type SessionData = typeof auth.$Infer.Session.session;
