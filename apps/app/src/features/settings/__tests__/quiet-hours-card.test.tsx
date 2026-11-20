// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
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

const TYPING_PAUSE_MS = 700;

describe("quiet hours card", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
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
    vi.useRealTimers();
  });

  it("given the parent moves the start of the quiet hours, then the new hours are saved once they stop typing", async () => {
    const calls = givenQuietHours({ enabled: true, start: "21:00", end: "07:00" });
    await renderWithProviders(<QuietHoursCard userId="user-1" />);

    fireEvent.change(await screen.findByLabelText("Début"), { target: { value: "22:30" } });
    await act(() => vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS));

    await waitFor(() =>
      expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
        enabled: true,
        start: "22:30",
        end: "07:00",
      }),
    );
    expect(await screen.findByText("Enregistré")).toBeDefined();
  });

  it("given quiet hours turned off, when the parent turns them on, then the server defaults, 21 h to 7 h, are saved at once", async () => {
    const calls = givenQuietHours({ enabled: false, start: "23:00", end: "06:00" });
    await renderWithProviders(<QuietHoursCard userId="user-1" />);

    fireEvent.click(await screen.findByRole("switch", { name: "Respecter les heures calmes" }));

    await waitFor(() =>
      expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
        enabled: true,
        start: "21:00",
        end: "07:00",
      }),
    );
    expect(await screen.findByLabelText("Début")).toHaveProperty("value", "21:00");
  });

  it("given the same start and end, then the form refuses them", async () => {
    const calls = givenQuietHours({ enabled: true, start: "21:00", end: "07:00" });
    await renderWithProviders(<QuietHoursCard userId="user-1" />);

    fireEvent.change(await screen.findByLabelText("Fin"), { target: { value: "21:00" } });
    await act(() => vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS));

    expect(await screen.findByText("Choisissez une fin différente du début.")).toBeDefined();
    expect(calls.some((call) => call.method === "PUT")).toBe(false);
  });
});
