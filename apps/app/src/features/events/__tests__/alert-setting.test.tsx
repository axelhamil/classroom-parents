// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { json, renderWithProviders, resetApp, stubApi } from "../../../__tests__/app-harness";
import { AlertSetting } from "../components/alert-setting";

const EVENT_ID = "0f6b6a2c-3c1d-4f0e-9a43-5d2b1c7e8f90";
const ALERT_PATH = `/events/${EVENT_ID}/alert`;

const DEFAULT_ALERT = {
  date: "2027-03-26",
  time: "18:00",
  dueAt: "2027-03-26T17:00:00.000Z",
  origin: "default",
};

function givenAlert(alert: unknown, afterReset: unknown = DEFAULT_ALERT) {
  let current = alert;

  return stubApi(({ method, url }) => {
    if (url.pathname !== ALERT_PATH) return undefined;
    if (method === "GET") return json({ alert: current });
    if (method === "DELETE") {
      current = afterReset;
      return new Response(null, { status: 204 });
    }
    if (method === "PUT")
      return json({
        date: "2027-03-28",
        time: "18:00",
        dueAt: "2027-03-28T16:00:00.000Z",
        origin: "user",
      });
    return undefined;
  });
}

const USER_ALERT = { ...DEFAULT_ALERT, date: "2027-03-27", time: "07:30", origin: "user" };

describe("alert setting", () => {
  afterEach(() => {
    cleanup();
    resetApp();
  });

  it("given the default alert, then it shows the default reminder", async () => {
    givenAlert(DEFAULT_ALERT);
    await renderWithProviders(<AlertSetting eventId={EVENT_ID} deadlineDate="2027-03-28" />);

    expect(await screen.findByText("Rappel 2 jours avant, 18 h")).toBeDefined();
  });

  it("given no alert, then it says no reminder is planned", async () => {
    givenAlert(null);
    await renderWithProviders(<AlertSetting eventId={EVENT_ID} deadlineDate="2027-03-28" />);

    expect(await screen.findByText("Pas de rappel programmé")).toBeDefined();
  });

  it("given the parent picks 28 March 2027 at 18:00, then the Paris wall time is sent as is", async () => {
    const calls = givenAlert(null);
    await renderWithProviders(<AlertSetting eventId={EVENT_ID} deadlineDate="2027-03-30" />);

    fireEvent.click(await screen.findByRole("button", { name: "Programmer un rappel" }));
    fireEvent.change(screen.getByLabelText("Jour"), { target: { value: "2027-03-28" } });
    fireEvent.change(screen.getByLabelText("Heure"), { target: { value: "18:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
        date: "2027-03-28",
        time: "18:00",
      }),
    );
  });

  it("given the parent's own alert, when it is dropped, then the default reminder comes back", async () => {
    const calls = givenAlert(USER_ALERT);
    await renderWithProviders(<AlertSetting eventId={EVENT_ID} deadlineDate="2027-03-28" />);

    fireEvent.click(await screen.findByRole("button", { name: "Retirer mon rappel" }));

    expect(await screen.findByText("Rappel 2 jours avant, 18 h")).toBeDefined();
    expect(await screen.findByText("Rappel par défaut rétabli")).toBeDefined();
    expect(calls.some((call) => call.method === "DELETE")).toBe(true);
  });

  it("given the parent's own alert and a default already past, when it is dropped, then it says no reminder is left", async () => {
    givenAlert(USER_ALERT, null);
    await renderWithProviders(<AlertSetting eventId={EVENT_ID} deadlineDate="2027-03-28" />);

    fireEvent.click(await screen.findByRole("button", { name: "Retirer mon rappel" }));

    expect(await screen.findByText("Pas de rappel programmé")).toBeDefined();
    expect(await screen.findByText(/Rappel retiré/)).toBeDefined();
    expect(screen.queryByText("Rappel par défaut rétabli")).toBeNull();
  });

  it("given the alert fails to load, then it reports the failure instead of claiming no reminder", async () => {
    stubApi(({ url }) =>
      url.pathname === ALERT_PATH ? json({ code: "INTERNAL" }, 500) : undefined,
    );
    await renderWithProviders(<AlertSetting eventId={EVENT_ID} deadlineDate="2027-03-28" />);

    expect(
      await screen.findByRole("button", { name: "Réessayer" }, { timeout: 10_000 }),
    ).toBeDefined();
    expect(screen.queryByText("Pas de rappel programmé")).toBeNull();
    expect(screen.queryByRole("button", { name: "Programmer un rappel" })).toBeNull();
  }, 15_000);
});
