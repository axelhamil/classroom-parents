/**
 * Proves against a real Postgres, through BetterAuth's real OAuth endpoints, that a
 * linked child's Google account never opens the parent's session: a parent signs in and
 * links the child through `google-classroom`, then the child's Google account tries to
 * sign in through `google-classroom` (refused) and through `google` (its own account,
 * never the parent's). Google's token endpoint is stubbed.
 */

import { exitUnlessLocalDatabase, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-child-sign-in", process.env.DATABASE_URL);

import { authSchema, count, db, eq } from "@packages/drizzle";
import { CHILD_PROVIDER_ID } from "../src/shared/auth/child-accounts";
import {
  Browser,
  removeProbeUsers,
  stubGoogleTokenEndpoint,
  userIdOf,
} from "./google-oauth-fixture";

const probe = `check-child-sign-in-${crypto.randomUUID()}`;
const parent = { sub: `${probe}-parent`, email: `${probe}-parent@example.com` };
const child = { sub: `${probe}-child`, email: `${probe}-child@school.example` };
const restoreFetch = stubGoogleTokenEndpoint();

async function sessionsOf(userId: string | undefined): Promise<number> {
  if (!userId) return 0;
  const [row] = await db
    .select({ total: count() })
    .from(authSchema.session)
    .where(eq(authSchema.session.userId, userId));
  return row?.total ?? 0;
}

function refusedCode(body: unknown): unknown {
  if (typeof body !== "object" || body === null || !("code" in body)) return undefined;
  return body.code;
}

const { step, run } = stepRunner("check-child-sign-in", async () => {
  restoreFetch();
  await removeProbeUsers(probe);
});

run(async () => {
  const parentBrowser = new Browser();
  await parentBrowser.signIn("google", parent);
  await parentBrowser.link(CHILD_PROVIDER_ID, child);
  const parentId = await userIdOf(parent.email);

  await step("the parent is signed in", (await parentBrowser.sessionEmail()) === parent.email);
  await step("the parent holds one session after linking", (await sessionsOf(parentId)) === 1);

  const childBrowser = new Browser();
  const throughChildProvider = await childBrowser.signIn(CHILD_PROVIDER_ID, child);
  await step(
    "signing in through google-classroom is refused",
    throughChildProvider.status === 403 &&
      refusedCode(throughChildProvider.body) === "CHILD_ACCOUNT_SIGN_IN_FORBIDDEN",
  );
  await step(
    "the refused attempt leaves the child browser signed out",
    (await childBrowser.sessionEmail()) === undefined,
  );

  await childBrowser.signIn("google", child);
  await step(
    "the child's google sign-in opens the child's own session, never the parent's",
    (await childBrowser.sessionEmail()) === child.email,
  );
  await step("no session was opened on the parent", (await sessionsOf(parentId)) === 1);
}, "a linked child's google account never opens the parent's session");
