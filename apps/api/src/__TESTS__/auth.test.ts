import { beforeEach, describe, expect, it, mock } from "bun:test";
import { EventTypes } from "@packages/events";
import { symmetricEncrypt } from "better-auth/crypto";
import { authSecretKey } from "../shared/auth/auth-secrets";
import { openToken } from "../shared/auth/token-sealing";
import { env } from "../shared/env";
import { runWithRequestContext } from "../shared/request-context";

const enqueue = mock(async (_events: { eventType: string; payload: unknown }[]) => undefined);

mock.module("../container", () => ({
  di: {
    IOutboxRepository: { enqueue },
  },
}));

const { auth } = await import("../auth");

const RESOLVED_IP = "198.51.100.7";
const SPOOFED_IP = "203.0.113.66";

const signedIn = {
  user: { id: "user-1", email: "user@example.com", emailVerified: true },
  session: { id: "session-1", ipAddress: SPOOFED_IP },
};

function verifyEmailHook(context: { session: unknown; newSession: unknown }) {
  const after = auth.options.hooks?.after;
  if (!after) throw new Error("auth has no after hook");

  return after({
    path: "/verify-email",
    method: "GET",
    headers: new Headers({ "x-forwarded-for": SPOOFED_IP }),
    context: { ...context, returned: {} },
  } as never);
}

function emailVerifiedEvents() {
  return enqueue.mock.calls
    .flatMap(([events]) => events)
    .filter((event) => event.eventType === EventTypes.USER_EMAIL_VERIFIED);
}

describe("auth after hook, /verify-email", () => {
  beforeEach(() => {
    enqueue.mockClear();
  });

  it("emits user.email_verified from the new session when the request had no session", async () => {
    await verifyEmailHook({ session: null, newSession: signedIn });

    expect(emailVerifiedEvents()[0]?.payload).toEqual({
      userId: "user-1",
      email: "user@example.com",
    });
  });

  it("emits nothing when the call verified nothing", async () => {
    await verifyEmailHook({ session: signedIn, newSession: null });

    expect(emailVerifiedEvents()).toHaveLength(0);
  });
});

const accountHooks = auth.options.databaseHooks.account;
const sessionBefore = auth.options.databaseHooks.session.create.before;

describe("session creation", () => {
  it("stores the trusted-proxy ip, not the client X-Forwarded-For", async () => {
    const result = await runWithRequestContext(
      { requestId: "req-1", clientIp: () => RESOLVED_IP },
      () => sessionBefore(signedIn.session as never, null),
    );

    expect(typeof result === "object" && result.data.ipAddress).toBe(RESOLVED_IP);
  });
});

describe("a linked child's google account", () => {
  const [linking] = auth.options.plugins;
  const [child] = linking.options.config;

  it("is never a way to sign in", async () => {
    const before = auth.options.hooks.before;

    const attempt = before({
      path: "/sign-in/social",
      body: { provider: "google-classroom" },
    } as never);

    await expect(attempt).rejects.toMatchObject({
      body: { code: "CHILD_ACCOUNT_SIGN_IN_FORBIDDEN" },
    });
  });

  it.each(["/refresh-token", "/get-access-token", "/unlink-account"])(
    "refuses %s over HTTP and lets the server call it",
    async (path) => {
      const before = auth.options.hooks.before;
      const body = { providerId: "google-classroom" };

      const overHttp = before({ path, body, request: new Request("http://api.test") } as never);

      await expect(overHttp).rejects.toMatchObject({
        body: { code: "LINKED_ACCOUNT_HTTP_FORBIDDEN" },
      });
      expect(await before({ path, body } as never)).toBeUndefined();
    },
  );

  it("is linked only through google-classroom, never under google", async () => {
    const before = auth.options.hooks.before;

    const attempt = before({ path: "/link-social", body: { provider: "google" } } as never);

    await expect(attempt).rejects.toMatchObject({
      body: { code: "CHILD_LINK_PROVIDER_FORBIDDEN" },
    });
  });

  it("never opens a session, even from its oauth callback", async () => {
    const callback = { path: "/callback/:id", params: { id: "google-classroom" } };

    expect(await sessionBefore(signedIn.session as never, callback as never)).toBe(false);
  });

  it("is linked under its own provider with the classroom scopes, offline and consent", () => {
    expect(child?.providerId).toBe("google-classroom");
    expect(child?.scopes).toEqual([
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/classroom.courses.readonly",
      "https://www.googleapis.com/auth/classroom.announcements.readonly",
    ]);
    expect(child?.accessType).toBe("offline");
    expect(child?.prompt).toBe("select_account consent");
  });

  it("keeps no id token at rest", async () => {
    const created = await accountHooks.create?.before?.(
      { idToken: "eyJ.child.jwt" } as never,
      null,
    );
    const updated = await accountHooks.update?.before?.({ idToken: "eyJ.child.jwt" }, null);

    expect(typeof created === "object" && created.data.idToken).toBeNull();
    expect(typeof updated === "object" && updated.data.idToken).toBeNull();
  });
});

describe("the parent's google sign-in", () => {
  const google = auth.options.socialProviders.google;

  it("asks only for the parent identity, with no offline grant", () => {
    expect(google).toMatchObject({
      disableDefaultScope: true,
      scope: ["openid", "email", "profile"],
    });
    expect("accessType" in google).toBe(false);
    expect("prompt" in google).toBe(false);
  });

  it("links a child account whose email differs from the parent's, never by email match", () => {
    expect(auth.options.account.accountLinking).toEqual({
      enabled: true,
      allowDifferentEmails: true,
      disableImplicitLinking: true,
    });
  });

  it("offers no password sign-in", () => {
    expect("emailAndPassword" in auth.options).toBe(false);
  });

  it("keeps the deletion fields rgpd reads on the user", () => {
    expect(Object.keys(auth.options.user.additionalFields)).toEqual([
      "pendingDeletionUntil",
      "deletedAt",
    ]);
  });
});

describe("linked account tokens", () => {
  it("are sealed by the library under the key openToken reads", async () => {
    expect(auth.options.account.encryptOAuthTokens).toBe(true);
    const context = await auth.$context;

    const sealed = await symmetricEncrypt({
      key: context.secretConfig,
      data: "1//fixture-refresh-token",
    });
    const opened = await openToken(sealed, authSecretKey(env));

    expect(sealed).not.toBe("1//fixture-refresh-token");
    expect(opened.getValue()).toBe("1//fixture-refresh-token");
  });
});

describe("account events", () => {
  beforeEach(() => {
    enqueue.mockClear();
  });

  const childAccount = {
    id: "account-1",
    userId: "user-1",
    providerId: "google-classroom",
    accountId: "g-1",
  };

  function emitted(eventType: string) {
    return enqueue.mock.calls
      .flatMap(([events]) => events)
      .filter((event) => event.eventType === eventType)
      .map((event) => event.payload);
  }

  it("announces a linked child account", async () => {
    await accountHooks.create?.after?.(childAccount as never, null);

    expect(emitted(EventTypes.USER_ACCOUNT_LINKED)).toEqual([
      { userId: "user-1", providerId: "google-classroom", accountId: "g-1" },
    ]);
  });

  it("does not announce the parent's own sign-in account as a linked child", async () => {
    await accountHooks.create?.after?.({ ...childAccount, providerId: "google" } as never, null);

    expect(emitted(EventTypes.USER_ACCOUNT_LINKED)).toEqual([]);
  });

  it("announces an unlinked account, which rgpd relies on", async () => {
    await accountHooks.delete?.after?.(childAccount as never, null);

    expect(emitted(EventTypes.USER_ACCOUNT_UNLINKED)).toEqual([
      { userId: "user-1", providerId: "google-classroom", accountId: "g-1" },
    ]);
  });
});
