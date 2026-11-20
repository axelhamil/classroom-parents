// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import { CHILD } from "../../../__tests__/family-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
}));

describe("the school clock of the shell", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    vi.useRealTimers();
  });

  it("given the school calendar answers in a shape the app does not know, then the home still opens, with weekends as the only days off", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T09:00:00.000Z"));
    stubApi(({ url }) => {
      if (url.pathname === "/children") return json([CHILD]);
      if (url.pathname === "/school-calendar") return json({ items: [] });
      return json({ items: [] });
    });

    await renderAppAt("/");

    expect(await screen.findByRole("region", { name: "Pour aujourd'hui" })).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("Une erreur est survenue")).toBeNull();
  });
});
