import { createI18n, frCatalog } from "@packages/i18n";
import { TooltipProvider } from "@packages/ui/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import { router } from "../../../router";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { queryClient } from "../../../shared/api/query-client";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
}));

async function renderPage(path: string) {
  queryClient.setQueryData(sessionQueryOptions.queryKey, {
    user: { id: "user-1", name: "Parent", email: "parent@example.com" },
    session: { token: "token-1" },
  });
  const i18n = await createI18n({ locale: "fr", resources: frCatalog });
  router.update({ ...router.options, history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("privacy pages", () => {
  afterEach(() => {
    queryClient.clear();
  });

  it.each(["/settings/privacy", "/legal/privacy-policy"])(
    "%s states the Google Limited Use commitment and names Anthropic as a sub-processor",
    async (path) => {
      const html = await renderPage(path);

      expect(html).toContain("Limited Use");
      expect(html).toContain("Anthropic");
      expect(html).toContain("contact@example.com");
    },
  );

  it.each(["/settings/privacy", "/legal/privacy-policy", "/legal/data-rights"])(
    "%s offers no data export and is written in French",
    async (path) => {
      const html = await renderPage(path);

      expect(html.toLowerCase()).not.toMatch(/export/);
      expect(html).not.toContain("boilerplate");
      expect(html).not.toContain("version anglaise");
    },
  );

  it("the privacy policy claims no per-account token key and caps the description only at extraction, as the code does", async () => {
    const html = await renderPage("/legal/privacy-policy");

    expect(html).not.toContain("propre à chaque compte");
    expect(html).toContain("XChaCha20-Poly1305");
    expect(html).not.toContain("300 caractères au plus");
    expect(html).toContain("300 caractères à l&#x27;extraction");
  });
});
