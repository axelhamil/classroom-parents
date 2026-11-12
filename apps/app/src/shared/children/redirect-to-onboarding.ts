import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { childrenQueryOptions } from "../api/queries/children";

export interface FamilyGuardArgs {
  context: { queryClient: QueryClient };
}

export async function redirectToOnboardingWithoutChild({ context }: FamilyGuardArgs) {
  const family = await context.queryClient.ensureQueryData(childrenQueryOptions).catch(() => null);

  if (family?.length === 0) throw redirect({ to: "/onboarding" });
}
