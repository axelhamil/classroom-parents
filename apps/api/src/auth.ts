import "zod/v4/core";
import { AppErrorException } from "@packages/ddd-kit";
import { db } from "@packages/drizzle";
import { type EventType, EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { di } from "./container";
import {
  childAccountLinking,
  guardChildProvider,
  linkedAccountHooks,
  throughChildProvider,
} from "./shared/auth/child-accounts";
import { GOOGLE_IDENTITY_SCOPES } from "./shared/auth/google-scopes";
import { SESSION_FRESH_AGE_SECONDS } from "./shared/auth/session-freshness";
import { asUnitOfWork } from "./shared/auth/unit-of-work-adapter";
import { env } from "./shared/env";
import { getClientIp } from "./shared/request-context";

async function emit<TPayload>(
  eventType: EventType,
  aggregateType: string,
  aggregateId: string,
  payload: TPayload,
): Promise<void> {
  await emitEvent(di.IOutboxRepository, eventType, aggregateType, aggregateId, payload);
}

const REVOKE_PATHS: ReadonlySet<string> = new Set([
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
]);

const authOptions = {
  appName: "KeepUpKids",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  secrets: env.BETTER_AUTH_SECRETS,
  rateLimit: { enabled: false },

  database: drizzleAdapter(
    asUnitOfWork(db, () => di.ITransactionService),
    { provider: "pg", transaction: true },
  ),

  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      disableDefaultScope: true,
      scope: [...GOOGLE_IDENTITY_SCOPES],
    },
  },

  plugins: [
    childAccountLinking({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }),
  ],

  account: {
    encryptOAuthTokens: true,
    accountLinking: { enabled: true, allowDifferentEmails: true, disableImplicitLinking: true },
  },

  user: {
    additionalFields: {
      pendingDeletionUntil: { type: "date", required: false, returned: true, input: false },
      deletedAt: { type: "date", required: false, returned: false, input: false },
    },
  },

  trustedOrigins: [env.APP_ORIGIN],

  session: { freshAge: SESSION_FRESH_AGE_SECONDS, cookieCache: { enabled: true, maxAge: 60 } },

  advanced: {
    ...(env.COOKIE_DOMAIN
      ? { crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN } }
      : {}),
    defaultCookieAttributes: {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
    },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => guardChildProvider(ctx)),

    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/verify-email") {
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
      if (!userId || ctx.path !== "/update-user") return;

      const body = ctx.body as Record<string, unknown> | undefined;
      const changes: Record<string, unknown> = {};
      if (typeof body?.name === "string") changes.name = body.name;
      if (typeof body?.image === "string") changes.image = body.image;
      await emit(EventTypes.USER_PROFILE_UPDATED, "user", userId, { userId, changes });
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
        before: async (session, context) => {
          if (context && throughChildProvider(context)) return false;
          return { data: { ...session, ipAddress: getClientIp() ?? null } };
        },
        after: async (session) => {
          await emit(EventTypes.USER_SIGNED_IN, "session", session.id, {
            userId: session.userId,
            sessionId: session.id,
            ipAddress: session.ipAddress ?? undefined,
            userAgent: session.userAgent ?? undefined,
          });
        },
      },
      delete: {
        before: async (session, context) => {
          if (!context || !REVOKE_PATHS.has(context.path)) return;
          const forgotten = await di.PushSubscriptionService.forgetSession(
            session.userId,
            session.id,
          );
          if (forgotten.isFailure) throw new AppErrorException(forgotten.getError());
        },
        after: async (session, context) => {
          if (!context || !REVOKE_PATHS.has(context.path)) return;
          await emit(EventTypes.USER_SESSION_REVOKED, "session", session.id, {
            userId: session.userId,
            sessionId: session.id,
          });
        },
      },
    },
    account: linkedAccountHooks(emit),
  },
} satisfies BetterAuthOptions;

export const auth = betterAuth(authOptions);

export type SessionUser = typeof auth.$Infer.Session.user;
export type SessionData = typeof auth.$Infer.Session.session;
