// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byRoute, json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";

describe("appearance card", () => {
  afterEach(() => {
    resetApp();
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    vi.restoreAllMocks();
  });

  it("settings appearance switches to Sombre and persists", async () => {
    stubApi(byRoute({ "GET /push/status": () => json({ live: 1 }) }));
    await renderAppAt("/settings");

    const light = await screen.findByRole("radio", { name: "Clair" });
    const dark = screen.getByRole("radio", { name: "Sombre" });
    expect(light.getAttribute("aria-checked")).toBe("true");

    await userEvent.setup().click(dark);

    await waitFor(() => expect(dark.getAttribute("aria-checked")).toBe("true"));
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("settings appearance offers Automatique, which follows the device and is kept", async () => {
    stubApi(byRoute({ "GET /push/status": () => json({ live: 1 }) }));
    await renderAppAt("/settings");

    const system = await screen.findByRole("radio", { name: "Automatique" });
    await userEvent.setup().click(system);

    await waitFor(() => expect(system.getAttribute("aria-checked")).toBe("true"));
    expect(localStorage.getItem("theme")).toBe("system");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
