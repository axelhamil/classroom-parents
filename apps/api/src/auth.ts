import "zod/v4/core";
import { db } from "@packages/drizzle";
import { type EventType, EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { di } from "./container";
import { GOOGLE_IDENTITY_SCOPES } from "./shared/auth/google-scopes";
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

const authOptions = {
  appName: "classroom-parents",
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
      accessType: "offline",
      prompt: "select_account consent",
    },
  },

  account: {
    encryptOAuthTokens: true,
    accountLinking: { enabled: true, allowDifferentEmails: true },
  },

  user: {
    additionalFields: {
      pendingDeletionUntil: { type: "date", required: false, returned: true, input: false },
      deletedAt: { type: "date", required: false, returned: false, input: false },
    },
  },

  trustedOrigins: [env.APP_ORIGIN],

  session: { cookieCache: { enabled: true, maxAge: 60 } },

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
      create: {
        after: async (account) => {
          await emit(EventTypes.USER_ACCOUNT_LINKED, "account", account.id, {
            userId: account.userId,
            providerId: account.providerId,
            accountId: account.accountId,
          });
        },
      },
      delete: {
        after: async (account) => {
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
