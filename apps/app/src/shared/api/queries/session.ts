import { createSessionQueryOptions } from "@packages/web-kit/api/session-query";
import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";
import { AUTH_QUERY_STALE_TIME_MS } from "../../auth/auth-stale-time";
import { sessionOrOffline } from "../../offline/offline-session";
import { queryClient } from "../query-client";

type SessionData = NonNullable<Awaited<ReturnType<typeof authClient.getSession>>["data"]>;

function recheckWhenOnline(): void {
  window.addEventListener(
    "online",
    () => void queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey }),
    { once: true },
  );
}

export const sessionQueryOptions = queryOptions({
  ...createSessionQueryOptions<SessionData>({
    getSession: () => sessionOrOffline(() => authClient.getSession(), recheckWhenOnline),
    staleTime: AUTH_QUERY_STALE_TIME_MS,
  }),
  networkMode: "always",
});

export const freshSessionQueryOptions = createSessionQueryOptions<SessionData>({
  getSession: () => authClient.getSession({ query: { disableCookieCache: true } }),
  staleTime: 0,
});
