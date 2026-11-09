import { type EventType, EventTypes } from "@packages/events";
import type { BetterAuthOptions } from "better-auth";
import { APIError, getOAuthState } from "better-auth/api";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { GOOGLE_CLASSROOM_SCOPES, GOOGLE_IDENTITY_SCOPES } from "./google-scopes";

export const CHILD_PROVIDER_ID = "google-classroom";

interface GoogleClient {
  clientId: string;
  clientSecret: string;
}

export function childAccountLinking(client: GoogleClient) {
  return genericOAuth({
    config: [
      {
        providerId: CHILD_PROVIDER_ID,
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
        scopes: [...GOOGLE_IDENTITY_SCOPES, ...GOOGLE_CLASSROOM_SCOPES],
        accessType: "offline",
        prompt: "select_account consent",
        disableSignUp: true,
      },
    ],
  });
}

function requestedProvider(request: { body?: unknown; params?: unknown }): string | undefined {
  for (const source of [request.body, request.params]) {
    if (typeof source !== "object" || source === null) continue;
    const provider =
      "provider" in source ? source.provider : "id" in source ? source.id : undefined;
    if (typeof provider === "string") return provider;
  }
  return undefined;
}

export function throughChildProvider(request: { body?: unknown; params?: unknown }): boolean {
  return requestedProvider(request) === CHILD_PROVIDER_ID;
}

export function guardChildProvider(request: {
  path: string;
  body?: unknown;
  params?: unknown;
}): void {
  if (request.path === "/sign-in/social" && throughChildProvider(request)) {
    throw new APIError("FORBIDDEN", {
      code: "CHILD_ACCOUNT_SIGN_IN_FORBIDDEN",
      message:
        "Le compte Google d'un enfant sert uniquement à lire Classroom. Connectez-vous avec votre propre compte Google.",
    });
  }

  if (request.path === "/link-social" && !throughChildProvider(request)) {
    throw new APIError("FORBIDDEN", {
      code: "CHILD_LINK_PROVIDER_FORBIDDEN",
      message: "Un compte enfant se lie uniquement par Google Classroom.",
    });
  }
}

type AccountHooks = NonNullable<NonNullable<BetterAuthOptions["databaseHooks"]>["account"]>;

type Emit = (
  eventType: EventType,
  aggregateType: string,
  aggregateId: string,
  payload: unknown,
) => Promise<void>;

type HookContext = Parameters<NonNullable<NonNullable<AccountHooks["create"]>["before"]>>[1];

async function linkingFlow(): Promise<boolean | undefined> {
  const state = await getOAuthState();
  return state ? Boolean(state.link) : undefined;
}

async function opensSecondSignInAccount(
  account: { providerId: string; userId: string },
  context: HookContext,
): Promise<boolean> {
  if (!context || account.providerId === CHILD_PROVIDER_ID) return false;
  if (await linkingFlow()) return true;

  const owned = await context.context.internalAdapter.findAccounts(account.userId);
  return owned.length > 0;
}

async function childSignInCallback(context: HookContext): Promise<boolean> {
  if (!context || !throughChildProvider(context)) return false;
  return (await linkingFlow()) === false;
}

export function linkedAccountHooks(emit: Emit): AccountHooks {
  return {
    create: {
      before: async (account, context) => {
        if (await opensSecondSignInAccount(account, context)) return false;
        return { data: { ...account, idToken: null } };
      },
      after: async (account) => {
        if (account.providerId !== CHILD_PROVIDER_ID) return;
        await emit(EventTypes.USER_ACCOUNT_LINKED, "account", account.id, {
          userId: account.userId,
          providerId: account.providerId,
          accountId: account.accountId,
        });
      },
    },
    update: {
      before: async (account, context) => {
        if (await childSignInCallback(context)) return false;
        return { data: { ...account, idToken: null } };
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
  };
}
