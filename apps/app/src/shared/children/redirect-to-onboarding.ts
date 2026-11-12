import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { childrenQueryOptions } from "../api/queries/children";
import { linkableAccountsQueryOptions } from "./child-link.queries";

export interface FamilyGuardArgs {
  context: { queryClient: QueryClient };
}

export async function redirectToOnboardingWithoutChild({ context }: FamilyGuardArgs) {
  const family = await context.queryClient.ensureQueryData(childrenQueryOptions).catch(() => null);
  if (family?.length !== 0) return;

  const pending = await context.queryClient
    .fetchQuery(linkableAccountsQueryOptions)
    .catch(() => []);

  if (pending.length > 0) throw redirect({ to: "/onboarding", search: { linked: 1 } });
  throw redirect({ to: "/onboarding" });
}
