import { throwApiError, toAuthClientError } from "@packages/web-kit/api/errors/api-error";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { api } from "../api/api-client";
import { childrenQueryOptions } from "../api/queries/children";
import { queryClient } from "../api/query-client";
import { authClient } from "../auth/auth-client";
import { linkConfigQueryOptions } from "./child-link.queries";

const $register = api.children.$post;
const $sync = api.sync[":childId"].$post;
const $edit = api.children[":id"].$patch;
const $discard = api.children.linkable[":linkedAccountId"].discard.$post;

type RegisteredChild = InferResponseType<typeof $register, 201>;
export type EditedChild = InferResponseType<typeof $edit, 200>;
export type EditChildInput = { id: string; changes: InferRequestType<typeof $edit>["json"] };

export type AddChildEntry = "/onboarding" | "/children/new";

export type ChildLinkRoundTrip =
  | { reconnectChildId: string }
  | { reconnectChildId: null; addFrom: AddChildEntry };

export const ADD_CHILD: ChildLinkRoundTrip = { reconnectChildId: null, addFrom: "/children/new" };

export const ADD_FIRST_CHILD: ChildLinkRoundTrip = {
  reconnectChildId: null,
  addFrom: "/onboarding",
};

const LINK_ERROR_PATH = "/children/link-error";

function roundTripPaths(roundTrip: ChildLinkRoundTrip) {
  if (roundTrip.reconnectChildId === null) {
    return { callbackPath: `${roundTrip.addFrom}?linked=1`, errorPath: roundTrip.addFrom };
  }

  return {
    callbackPath: `/children?reconnect=${roundTrip.reconnectChildId}`,
    errorPath: `${LINK_ERROR_PATH}?reconnect=${roundTrip.reconnectChildId}`,
  };
}

async function childEmail(childId: string | null): Promise<string | undefined> {
  if (childId === null) return undefined;
  const children = await queryClient.ensureQueryData(childrenQueryOptions);

  return children.find((child) => child.id === childId)?.googleEmail;
}

export const startChildLinkMutationOptions = mutationOptions({
  mutationKey: ["children", "link", "start"] as const,
  mutationFn: async (roundTrip: ChildLinkRoundTrip): Promise<void> => {
    const config = await queryClient.fetchQuery(linkConfigQueryOptions);
    const { callbackPath, errorPath } = roundTripPaths(roundTrip);
    const origin = window.location.origin;
    const { error } = await authClient.linkSocial({
      provider: config.providerId,
      scopes: config.scopes,
      callbackURL: new URL(callbackPath, origin).href,
      errorCallbackURL: new URL(errorPath, origin).href,
      loginHint: await childEmail(roundTrip.reconnectChildId),
    });
    if (error) throw toAuthClientError(error, errorFallback("linkChild"));
  },
});

export const registerChildMutationOptions = mutationOptions({
  mutationKey: ["children", "register"] as const,
  mutationFn: async (linkedAccountId: string): Promise<RegisteredChild> => {
    const res = await $register({ json: { linkedAccountId } });
    if (!res.ok) await throwApiError(res, "linkChild");
    return res.json();
  },
});

export const syncChildMutationOptions = mutationOptions({
  mutationKey: ["children", "sync"] as const,
  mutationFn: async (childId: string): Promise<void> => {
    const res = await $sync({ param: { childId } });
    if (!res.ok) await throwApiError(res, "syncChild");
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: childrenQueryOptions.queryKey }),
});

export const editChildMutationOptions = mutationOptions({
  mutationKey: ["children", "edit"] as const,
  mutationFn: async ({ id, changes }: EditChildInput): Promise<EditedChild> => {
    const res = await $edit({ param: { id }, json: changes });
    if (!res.ok) await throwApiError(res, "editChild");
    return res.json();
  },
});

export const discardLinkedAccountsMutationOptions = mutationOptions({
  mutationKey: ["children", "linkable", "discard"] as const,
  mutationFn: async (linkedAccountIds: readonly string[]): Promise<void> => {
    for (const linkedAccountId of linkedAccountIds) {
      const res = await $discard({ param: { linkedAccountId } });
      if (!res.ok) await throwApiError(res, "discardLinkedAccount");
    }
  },
});
