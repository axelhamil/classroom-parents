/**
 * Drives BetterAuth's real OAuth endpoints in process for the real-database checks:
 * start a sign-in or a link, then hit the callback with a fixture code. Google's token
 * endpoint is stubbed: a code `<sub>|<email>` yields an unsigned id token for that
 * identity, a refresh yields a numbered access token and no new refresh token.
 */

import { authSchema, db, eq, inArray, like, outboxSchema } from "@packages/drizzle";
import { auth } from "../src/auth";
import { env } from "../src/shared/env";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface GoogleIdentity {
  sub: string;
  email: string;
}

export function plainAccessToken(identity: GoogleIdentity): string {
  return `ya29.fixture-access-${identity.sub}`;
}

export function plainRefreshToken(identity: GoogleIdentity): string {
  return `1//fixture-refresh-${identity.sub}`;
}

export function refreshedAccessToken(round: number): string {
  return `ya29.fixture-refreshed-${round}`;
}

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function idToken(identity: GoogleIdentity): string {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: "https://accounts.google.com",
    aud: env.GOOGLE_CLIENT_ID,
    sub: identity.sub,
    email: identity.email,
    email_verified: true,
    name: `Fixture ${identity.sub}`,
    iat: now,
    exp: now + 3600,
  };
  return `${base64url({ alg: "RS256", kid: "fixture" })}.${base64url(claims)}.fixture`;
}

export function stubGoogleTokenEndpoint(): () => void {
  const realFetch = globalThis.fetch;
  let refreshes = 0;

  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = input instanceof Request ? input.url : input.toString();
      if (!url.startsWith(GOOGLE_TOKEN_URL)) return realFetch(input, init);

      const form = new URLSearchParams(String(init?.body ?? ""));
      if (form.get("grant_type") === "refresh_token") {
        refreshes += 1;
        return Response.json({
          access_token: refreshedAccessToken(refreshes),
          expires_in: 3599,
          token_type: "Bearer",
        });
      }

      const [sub = "", email = ""] = String(form.get("code")).split("|");
      const identity = { sub, email };
      return Response.json({
        access_token: plainAccessToken(identity),
        refresh_token: plainRefreshToken(identity),
        id_token: idToken(identity),
        expires_in: 3599,
        token_type: "Bearer",
      });
    },
    { preconnect: realFetch.preconnect },
  );

  return () => {
    globalThis.fetch = realFetch;
  };
}

interface Reply {
  status: number;
  body: unknown;
}

export class Browser {
  private readonly cookies = new Map<string, string>();

  async call(path: string, body?: unknown): Promise<Reply> {
    const response = await auth.handler(
      new Request(`${env.BETTER_AUTH_URL}/api/auth${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "content-type": "application/json",
          origin: env.APP_ORIGIN,
          cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
      }),
    );

    for (const header of response.headers.getSetCookie()) {
      const [pair = ""] = header.split(";");
      const separator = pair.indexOf("=");
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }

    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }

  async sessionEmail(): Promise<string | undefined> {
    const { body } = await this.call("/get-session");
    if (typeof body !== "object" || body === null || !("user" in body)) return undefined;

    const { user } = body;
    if (typeof user !== "object" || user === null || !("email" in user)) return undefined;
    return typeof user.email === "string" ? user.email : undefined;
  }

  signIn(provider: string, identity: GoogleIdentity, callbackProvider = provider): Promise<Reply> {
    return this.oauth("/sign-in/social", provider, identity, callbackProvider);
  }

  link(provider: string, identity: GoogleIdentity, callbackProvider = provider): Promise<Reply> {
    return this.oauth("/link-social", provider, identity, callbackProvider);
  }

  private async oauth(
    start: string,
    provider: string,
    identity: GoogleIdentity,
    callbackProvider: string,
  ): Promise<Reply> {
    const started = await this.call(start, {
      provider,
      callbackURL: `${env.APP_ORIGIN}/`,
    });
    const { body } = started;
    if (typeof body !== "object" || body === null || !("url" in body)) return started;
    if (typeof body.url !== "string") return started;

    const state = new URL(body.url).searchParams.get("state") ?? "";
    const code = encodeURIComponent(`${identity.sub}|${identity.email}`);
    return this.call(`/callback/${callbackProvider}?code=${code}&state=${state}`);
  }
}

export async function userIdOf(email: string): Promise<string | undefined> {
  const [row] = await db
    .select({ id: authSchema.user.id })
    .from(authSchema.user)
    .where(eq(authSchema.user.email, email));
  return row?.id;
}

export async function removeProbeUsers(emailPrefix: string): Promise<void> {
  const users = await db
    .select({ id: authSchema.user.id })
    .from(authSchema.user)
    .where(like(authSchema.user.email, `${emailPrefix}%`));
  const userIds = users.map(({ id }) => id);
  if (userIds.length === 0) return;

  const accounts = await db
    .select({ id: authSchema.account.id })
    .from(authSchema.account)
    .where(inArray(authSchema.account.userId, userIds));
  const sessions = await db
    .select({ id: authSchema.session.id })
    .from(authSchema.session)
    .where(inArray(authSchema.session.userId, userIds));
  const aggregateIds = [
    ...userIds,
    ...accounts.map(({ id }) => id),
    ...sessions.map(({ id }) => id),
  ];

  await db
    .delete(outboxSchema.outboxEvent)
    .where(inArray(outboxSchema.outboxEvent.aggregateId, aggregateIds));
  await db.delete(authSchema.user).where(inArray(authSchema.user.id, userIds));
}
