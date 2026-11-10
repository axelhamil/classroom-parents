/**
 * Proves against a real Postgres that the Google tokens of a linked child account are
 * sealed by the library's own write path: a parent signs in, links a child through the
 * real `/link-social` and `/callback/google-classroom` endpoints, and the stored row holds
 * sealed tokens `openToken` opens and no id token. Two refreshes then prove the library's
 * update path keeps a single seal layer. Google's token endpoint is stubbed.
 */

import { exitUnlessLocalDatabase, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-token-sealing", process.env.DATABASE_URL);

import { CHILD_PROVIDER_ID } from "@modules/children/application/config/child-provider";
import { and, authSchema, db, eq } from "@packages/drizzle";
import { auth } from "../src/auth";
import { authSecretKey } from "../src/shared/auth/auth-secrets";
import { openToken } from "../src/shared/auth/token-sealing";
import { env } from "../src/shared/env";
import {
  Browser,
  plainAccessToken,
  plainRefreshToken,
  refreshedAccessToken,
  removeProbeUsers,
  stubGoogleTokenEndpoint,
  userIdOf,
} from "./google-oauth-fixture";

const probe = `check-token-sealing-${crypto.randomUUID()}`;
const parent = { sub: `${probe}-parent`, email: `${probe}-parent@example.com` };
const child = { sub: `${probe}-child`, email: `${probe}-child@school.example` };
const key = authSecretKey(env);
const restoreFetch = stubGoogleTokenEndpoint();

async function childAccount() {
  const [row] = await db
    .select()
    .from(authSchema.account)
    .where(
      and(
        eq(authSchema.account.providerId, CHILD_PROVIDER_ID),
        eq(authSchema.account.accountId, child.sub),
      ),
    );
  return row;
}

async function opened(sealed: string | null | undefined): Promise<string | undefined> {
  if (!sealed) return undefined;
  const result = await openToken(sealed, key);
  return result.isSuccess ? result.getValue() : undefined;
}

const { step, fail, run } = stepRunner("check-token-sealing", async () => {
  restoreFetch();
  await removeProbeUsers(probe);
});

run(async () => {
  const browser = new Browser();
  await browser.signIn("google", parent);
  await browser.link(CHILD_PROVIDER_ID, child);

  const linked = await childAccount();
  if (!linked) return fail("the link callback stored the child account");
  await step(
    "the link callback stored the child under the parent",
    linked.userId === (await userIdOf(parent.email)),
  );
  await step("access token is not stored in clear", linked.accessToken !== plainAccessToken(child));
  await step(
    "refresh token is not stored in clear",
    linked.refreshToken !== plainRefreshToken(child),
  );
  await step(
    "openToken returns the access token",
    (await opened(linked.accessToken)) === plainAccessToken(child),
  );
  await step(
    "openToken returns the refresh token",
    (await opened(linked.refreshToken)) === plainRefreshToken(child),
  );
  await step("no id token is kept at rest", linked.idToken === null);

  for (const round of [1, 2]) {
    await auth.api.refreshToken({ body: { accountId: linked.id, userId: linked.userId } });
    const updated = await childAccount();
    if (!updated) return fail(`the child account exists after refresh ${round}`);

    await step(
      `refresh ${round}: the new access token is sealed once`,
      (await opened(updated.accessToken)) === refreshedAccessToken(round),
    );
    await step(
      `refresh ${round}: the rewritten refresh token keeps a single seal`,
      (await opened(updated.refreshToken)) === plainRefreshToken(child),
    );
  }

  const served = await auth.api.getAccessToken({
    body: { accountId: linked.id, userId: linked.userId },
  });
  await step(
    "the library serves the access token in clear",
    served.accessToken === refreshedAccessToken(2),
  );
}, "linked child tokens are sealed by the library's write path and never sealed twice");
