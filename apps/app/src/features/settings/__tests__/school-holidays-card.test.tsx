// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, renderWithProviders, resetApp, stubApi } from "../../../__tests__/app-harness";
import { SchoolHolidaysCard } from "../components/school-holidays-card";

const ACADEMIES = [
  { id: "paris", name: "Paris", zone: "zone-c" },
  { id: "rennes", name: "Rennes", zone: "zone-b" },
];

function givenSchoolZone(zone: string | null) {
  return stubApi(({ method, url, body }) => {
    if (url.pathname !== "/school-calendar/zone") return undefined;
    if (method === "GET") return json({ zone, academies: ACADEMIES });
    if (method === "PUT") return json({ ...(body as object), academies: ACADEMIES });
    return undefined;
  });
}

async function choose(label: string, option: string) {
  fireEvent.keyDown(await screen.findByRole("combobox", { name: label }), { key: "Enter" });
  fireEvent.keyDown(await screen.findByRole("option", { name: option }), { key: "Enter" });
}

describe("school holidays card", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
  });

  afterEach(() => {
    cleanup();
    resetApp();
    vi.unstubAllGlobals();
  });

  it("given a parent without a zone who picks their academy, then the academy's zone is proposed and saved", async () => {
    const calls = givenSchoolZone(null);
    await renderWithProviders(<SchoolHolidaysCard userId="user-1" />);

    expect(
      await screen.findByText("Aucune zone choisie : les vacances ne s'affichent pas encore."),
    ).toBeDefined();
    await choose("Académie", "Rennes");
    expect(screen.getByRole("combobox", { name: "Zone" }).textContent).toBe("Zone B");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ zone: "zone-b" }),
    );
    expect(await screen.findByText("Zone scolaire enregistrée")).toBeDefined();
  });

  it("given a parent who clears their zone, then no zone is saved", async () => {
    const calls = givenSchoolZone("zone-c");
    await renderWithProviders(<SchoolHolidaysCard userId="user-1" />);

    await choose("Zone", "Aucune zone");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ zone: null }),
    );
  });
});
