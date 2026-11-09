/**
 * Proves against a real Postgres that the Google tokens of a linked account are stored
 * sealed, open with `openToken`, and keep a single seal layer across the library's own
 * update path (a refresh that returns no new refresh token rewrites the stored one).
 * Google's token endpoint is stubbed, every token is a fixture.
 */

import { exitUnlessLocalDatabase, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-token-sealing", process.env.DATABASE_URL);

import { authSchema, db, eq, inArray, outboxSchema } from "@packages/drizzle";
import { symmetricEncrypt } from "better-auth/crypto";
import { auth } from "../src/auth";
import { authSecretKey } from "../src/shared/auth/auth-secrets";
import { openToken } from "../src/shared/auth/token-sealing";
import { env } from "../src/shared/env";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const PLAIN_ACCESS = "ya29.fixture-access-token";
const PLAIN_REFRESH = "1//fixture-refresh-token";
const probe = `check-token-sealing-${crypto.randomUUID()}`;
const key = authSecretKey(env);

const probeIds: string[] = [];
let refreshes = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
  async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : input.toString();
    if (!url.startsWith(GOOGLE_TOKEN_URL)) return realFetch(input, init);

    refreshes += 1;
    return Response.json({
      access_token: `ya29.fixture-refreshed-${refreshes}`,
      expires_in: 3599,
      token_type: "Bearer",
    });
  },
  { preconnect: realFetch.preconnect },
);

async function storedTokens(accountId: string) {
  const [row] = await db
    .select({
      accessToken: authSchema.account.accessToken,
      refreshToken: authSchema.account.refreshToken,
    })
    .from(authSchema.account)
    .where(eq(authSchema.account.id, accountId));
  return row;
}

async function opened(sealed: string | null | undefined): Promise<string | undefined> {
  if (!sealed) return undefined;
  const result = await openToken(sealed, key);
  return result.isSuccess ? result.getValue() : undefined;
}

const { step, fail, run } = stepRunner("check-token-sealing", async () => {
  globalThis.fetch = realFetch;
  if (probeIds.length > 0) {
    await db
      .delete(outboxSchema.outboxEvent)
      .where(inArray(outboxSchema.outboxEvent.aggregateId, probeIds));
  }
  await db.delete(authSchema.user).where(eq(authSchema.user.email, `${probe}@example.com`));
});

run(async () => {
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser(
    {
      email: `${probe}@example.com`,
      name: "Token Sealing Probe",
      emailVerified: true,
    },
    { method: "oauth", oauth: { providerId: "google" } },
  );
  probeIds.push(user.id);

  const account = await context.internalAdapter.createAccount({
    userId: user.id,
    providerId: "google",
    accountId: probe,
    accessToken: await symmetricEncrypt({ key: context.secretConfig, data: PLAIN_ACCESS }),
    refreshToken: await symmetricEncrypt({ key: context.secretConfig, data: PLAIN_REFRESH }),
    accessTokenExpiresAt: new Date(Date.now() - 60_000),
  });
  probeIds.push(account.id);

  const created = await storedTokens(account.id);
  if (!created) return fail("the account row exists after create");
  await step("access token is not stored in clear", created.accessToken !== PLAIN_ACCESS);
  await step("refresh token is not stored in clear", created.refreshToken !== PLAIN_REFRESH);
  await step(
    "openToken returns the access token",
    (await opened(created.accessToken)) === PLAIN_ACCESS,
  );
  await step(
    "openToken returns the refresh token",
    (await opened(created.refreshToken)) === PLAIN_REFRESH,
  );

  for (const round of [1, 2]) {
    await auth.api.refreshToken({ body: { accountId: account.id, userId: user.id } });
    const updated = await storedTokens(account.id);
    if (!updated) return fail(`the account row exists after update ${round}`);

    await step(
      `update ${round}: the new access token is sealed once`,
      (await opened(updated.accessToken)) === `ya29.fixture-refreshed-${round}`,
    );
    await step(
      `update ${round}: the rewritten refresh token keeps a single seal`,
      (await opened(updated.refreshToken)) === PLAIN_REFRESH,
    );
  }

  const served = await auth.api.getAccessToken({
    body: { accountId: account.id, userId: user.id },
  });
  await step(
    "the library serves the access token in clear",
    served.accessToken === "ya29.fixture-refreshed-2",
  );
}, "linked account tokens are sealed at rest and never sealed twice");
