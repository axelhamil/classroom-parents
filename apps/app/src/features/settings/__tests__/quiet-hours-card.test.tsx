// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, renderWithProviders, resetApp, stubApi } from "../../../__tests__/app-harness";
import { QuietHoursCard } from "../components/quiet-hours-card";

function givenQuietHours(quiet: unknown) {
  return stubApi(({ method, url, body }) => {
    if (url.pathname !== "/reminders/quiet-hours") return undefined;
    if (method === "GET") return json(quiet);
    if (method === "PUT") return json(body);
    return undefined;
  });
}

describe("quiet hours card", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    resetApp();
    vi.unstubAllGlobals();
  });

  it("given the parent moves the start of the quiet hours, then the new hours are saved", async () => {
    const calls = givenQuietHours({ enabled: true, start: "21:00", end: "07:00" });
    await renderWithProviders(<QuietHoursCard userId="user-1" />);

    fireEvent.change(await screen.findByLabelText("Début"), { target: { value: "22:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
        enabled: true,
        start: "22:30",
        end: "07:00",
      }),
    );
    expect(await screen.findByText("Heures calmes enregistrées")).toBeDefined();
  });

  it("given the same start and end, then the form refuses them", async () => {
    const calls = givenQuietHours({ enabled: true, start: "21:00", end: "07:00" });
    await renderWithProviders(<QuietHoursCard userId="user-1" />);

    fireEvent.change(await screen.findByLabelText("Fin"), { target: { value: "21:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Choisissez une fin différente du début.")).toBeDefined();
    expect(calls.some((call) => call.method === "PUT")).toBe(false);
  });
});
