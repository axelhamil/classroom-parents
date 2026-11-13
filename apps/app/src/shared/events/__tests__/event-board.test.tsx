// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import { CHILD } from "../../../__tests__/family-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "light",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
}));

function givenNoEvents(): void {
  stubApi(({ method, url }) => {
    if (url.pathname === "/children") return json([CHILD]);
    if (url.pathname === "/events" && method === "GET") return json({ items: [] });
    if (url.pathname === "/sync") return json({ status: "requested" }, 202);
    return undefined;
  });
}

describe("event board", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    vi.restoreAllMocks();
  });

  it("given no past deadline, the history board points back to upcoming deadlines", async () => {
    givenNoEvents();
    await renderAppAt("/?tab=history");

    const action = await screen.findByRole("link", { name: "Voir les échéances à venir" });

    expect(action.closest("[data-slot=empty]")).not.toBeNull();
    expect(action.getAttribute("href")).toBe("/");
  });
});
