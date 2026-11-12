import { createI18n, frCatalog } from "@packages/i18n";
import { TooltipProvider } from "@packages/ui/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { vi } from "vitest";
import { router } from "../router";
import { sessionQueryOptions } from "../shared/api/queries/session";
import { queryClient } from "../shared/api/query-client";
import { ensureMatchMedia } from "./match-media";

export interface ApiCall {
  method: string;
  path: string;
  body: unknown;
}

export interface FakeReply {
  status?: number;
  body?: unknown;
}

export type FakeRoutes = Record<string, FakeReply | ((call: ApiCall) => FakeReply)>;

const SIGNED_IN = {
  user: { id: "user-1", name: "Parent Démo", email: "parent@example.com" },
  session: { token: "token-1" },
};

export function errorReply(status: number, code: string): FakeReply {
  return { status, body: { error: { code, message: "server copy" } } };
}

export function fakeApi(routes: FakeRoutes): ApiCall[] {
  const calls: ApiCall[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const text = request.body ? await request.text() : "";
    const call = {
      method: request.method,
      path: url.pathname,
      body: text ? JSON.parse(text) : null,
    };
    calls.push(call);

    const route = routes[`${call.method} ${call.path}`];
    const reply = typeof route === "function" ? route(call) : route;
    if (!reply) return Response.json({ error: { code: "HTTP_404" } }, { status: 404 });
    if (reply.body === undefined) return new Response(null, { status: reply.status ?? 204 });

    return Response.json(reply.body, { status: reply.status ?? 200 });
  });

  return calls;
}

export interface RenderAppOptions {
  signedIn?: boolean;
}

export async function renderApp(
  url: string,
  { signedIn = true }: RenderAppOptions = {},
): Promise<{ unmount: () => void }> {
  ensureMatchMedia();
  const i18n = await createI18n({ locale: "fr", resources: frCatalog });
  queryClient.setQueryData(sessionQueryOptions.queryKey, signedIn ? SIGNED_IN : null);
  const appRouter = createRouter({
    ...router.options,
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await appRouter.load();

  const view = render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <RouterProvider router={appRouter} />
        </TooltipProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );

  return { unmount: view.unmount };
}

export function resetApp(): void {
  queryClient.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
}
