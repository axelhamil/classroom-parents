import { createI18n, frCatalog } from "@packages/i18n";
import { Toaster } from "@packages/ui/components/ui/sonner";
import { TooltipProvider } from "@packages/ui/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { type RenderResult, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { toast } from "sonner";
import { vi } from "vitest";
import { router } from "../router";
import { sessionQueryOptions } from "../shared/api/queries/session";
import { queryClient } from "../shared/api/query-client";

export interface ApiCall {
  method: string;
  url: URL;
  body: unknown;
}

export type ApiHandler = (call: ApiCall) => Response | undefined;

export type RouteReplies = Record<string, (call: ApiCall) => Response>;

export function byRoute(routes: RouteReplies): ApiHandler {
  return (call) => routes[`${call.method} ${call.url.pathname}`]?.(call);
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function readBody(body: BodyInit | null | undefined): unknown {
  return typeof body === "string" ? JSON.parse(body) : undefined;
}

export function stubApi(handler: ApiHandler): ApiCall[] {
  const calls: ApiCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = {
        method: init?.method ?? "GET",
        url: new URL(input instanceof Request ? input.url : input),
        body: readBody(init?.body),
      };
      calls.push(call);
      if (call.url.pathname === "/stream") return new Promise<Response>(() => undefined);

      return handler(call) ?? json({ code: "NOT_FOUND" }, 404);
    }),
  );

  return calls;
}

export async function renderWithProviders(ui: ReactNode): Promise<RenderResult> {
  const i18n = await createI18n({ locale: "fr", resources: frCatalog });

  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          {ui}
          <Toaster />
        </TooltipProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

export async function renderAppAt(path: string): Promise<typeof router> {
  queryClient.setQueryData(sessionQueryOptions.queryKey, {
    user: { id: "user-1", name: "Parent", email: "parent@example.com" },
    session: { token: "token-1" },
  });
  const appRouter = createRouter({
    ...router.options,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await appRouter.load();
  await renderWithProviders(<RouterProvider router={appRouter} />);

  return appRouter;
}

export function resetApp(): void {
  queryClient.clear();
  toast.dismiss();
  vi.unstubAllGlobals();
}
