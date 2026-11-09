/**
 * Proves against a real Postgres, through BetterAuth's real OAuth endpoints, that a
 * linked child's Google account never opens the parent's session: a parent signs in and
 * links the child through `google-classroom`, then the child's Google account tries to
 * sign in through `google-classroom` (refused) and through `google` (its own account,
 * never the parent's). A parent then tries to link a child under `google`, directly or by
 * rewriting the link's redirect to `/callback/google`: the parent keeps its single
 * `google` account and the child never lands on the parent's session. A sign-in state
 * replayed on `/callback/google-classroom` leaves the child's stored tokens untouched.
 * The database itself refuses a second row for the same provider account, so two
 * concurrent links of one child cannot attach it to two parents.
 * Over HTTP the parent can neither read the child's tokens back (`/refresh-token`,
 * `/get-access-token`) nor unlink an account (`/unlink-account`): unlinking its only
 * `google` account would lock it out, and unlinking the child would skip Google's revoke.
 * Google's token endpoint is stubbed.
 */

import { exitUnlessLocalDatabase, sessionsOf, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-child-sign-in", process.env.DATABASE_URL);

import { and, authSchema, count, db, eq } from "@packages/drizzle";
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

async function accountsOf(userId: string | undefined, providerId: string): Promise<number> {
  if (!userId) return 0;
  const [row] = await db
    .select({ total: count() })
    .from(authSchema.account)
    .where(
      and(eq(authSchema.account.userId, userId), eq(authSchema.account.providerId, providerId)),
    );
  return row?.total ?? 0;
}

function leaksNoToken(body: unknown): boolean {
  const text = JSON.stringify(body ?? null);
  return !text.includes("accessToken") && !text.includes("refreshToken");
}

async function storedChildAccessToken(): Promise<string | null | undefined> {
  const [row] = await db
    .select({ accessToken: authSchema.account.accessToken })
    .from(authSchema.account)
    .where(
      and(
        eq(authSchema.account.providerId, CHILD_PROVIDER_ID),
        eq(authSchema.account.accountId, child.sub),
      ),
    );
  return row?.accessToken;
}

async function landsOnOwnSession(identity: { sub: string; email: string }): Promise<boolean> {
  const browser = new Browser();
  await browser.signIn("google", identity);
  return (await browser.sessionEmail()) === identity.email;
}

async function linksChildTwice(userId: string | undefined): Promise<unknown> {
  if (!userId) return "no second user";

  try {
    await db.insert(authSchema.account).values({
      id: `${probe}-second-link`,
      userId,
      providerId: CHILD_PROVIDER_ID,
      accountId: child.sub,
    });
    return "inserted";
  } catch (err) {
    return err instanceof Error && err.cause instanceof Error ? err.cause : err;
  }
}

function isUniqueViolation(err: unknown, constraint: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  if (!("code" in err) || !("constraint" in err)) return false;

  return err.code === "23505" && err.constraint === constraint;
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

  for (const path of ["/refresh-token", "/get-access-token"]) {
    const read = await parentBrowser.call(path, { providerId: CHILD_PROVIDER_ID });
    await step(
      `${path} is refused over HTTP and returns no token`,
      read.status === 403 &&
        refusedCode(read.body) === "LINKED_ACCOUNT_HTTP_FORBIDDEN" &&
        leaksNoToken(read.body),
    );
  }

  const unlinkGoogle = await parentBrowser.call("/unlink-account", { providerId: "google" });
  await step(
    "unlinking the parent's only google account over HTTP is refused",
    unlinkGoogle.status === 403 &&
      refusedCode(unlinkGoogle.body) === "LINKED_ACCOUNT_HTTP_FORBIDDEN",
  );
  await step("the parent keeps its google account", (await accountsOf(parentId, "google")) === 1);

  const unlinkChild = await parentBrowser.call("/unlink-account", {
    providerId: CHILD_PROVIDER_ID,
    accountId: child.sub,
  });
  await step(
    "unlinking the child over HTTP is refused, it goes through the revoking disconnect",
    unlinkChild.status === 403 && refusedCode(unlinkChild.body) === "LINKED_ACCOUNT_HTTP_FORBIDDEN",
  );
  await step(
    "the child's linked account is still there",
    (await accountsOf(parentId, CHILD_PROVIDER_ID)) === 1,
  );

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

  const directly = {
    sub: `${probe}-linked-under-google`,
    email: `${probe}-sibling@school.example`,
  };
  const linkedUnderGoogle = await parentBrowser.link("google", directly);
  await step(
    "linking a child under google is refused",
    linkedUnderGoogle.status === 403 &&
      refusedCode(linkedUnderGoogle.body) === "CHILD_LINK_PROVIDER_FORBIDDEN",
  );
  await step(
    "the parent still owns one google account",
    (await accountsOf(parentId, "google")) === 1,
  );
  await step(
    "a child linked under google opens its own session, never the parent's",
    await landsOnOwnSession(directly),
  );

  const rewritten = { sub: `${probe}-redirect-rewritten`, email: `${probe}-cousin@school.example` };
  await parentBrowser.link(CHILD_PROVIDER_ID, rewritten, "google");
  await step(
    "a link redirected to /callback/google creates no google account on the parent",
    (await accountsOf(parentId, "google")) === 1,
  );
  await step(
    "a child whose link was redirected opens its own session, never the parent's",
    await landsOnOwnSession(rewritten),
  );

  const tokensBeforeHijack = await storedChildAccessToken();
  await new Browser().signIn("google", child, CHILD_PROVIDER_ID);
  await step(
    "a sign-in replayed on /callback/google-classroom leaves the child's tokens untouched",
    tokensBeforeHijack !== undefined && (await storedChildAccessToken()) === tokensBeforeHijack,
  );
  await step("the parent still holds a single session", (await sessionsOf(parentId)) === 1);

  const secondLink = await linksChildTwice(await userIdOf(child.email));
  await step(
    "a child google account already linked cannot be stored for a second user",
    isUniqueViolation(secondLink, "account_provider_account_uidx"),
    secondLink instanceof Error ? secondLink.message : secondLink,
  );
}, "a linked child's google account never opens the parent's session");
