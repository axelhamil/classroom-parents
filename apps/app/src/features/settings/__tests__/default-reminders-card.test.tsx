// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { json, renderWithProviders, resetApp, stubApi } from "../../../__tests__/app-harness";
import { DefaultRemindersCard } from "../components/default-reminders-card";

function givenDefaults(reminders: unknown[]) {
  return stubApi(({ method, url, body }) => {
    if (url.pathname !== "/reminders/defaults") return undefined;
    if (method === "GET") return json({ reminders });
    if (method === "PUT") return json(body);
    return undefined;
  });
}

describe("default reminders card", () => {
  afterEach(() => {
    cleanup();
    resetApp();
  });

  it("given the parent adds a second default, then the whole list is saved", async () => {
    const calls = givenDefaults([{ kind: "days_before", days: 2, time: "18:00" }]);
    await renderWithProviders(<DefaultRemindersCard userId="user-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Ajouter un rappel" }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
        reminders: [
          { kind: "days_before", days: 2, time: "18:00" },
          { kind: "days_before", days: 1, time: "18:00" },
        ],
      }),
    );
    expect(await screen.findByText("Rappels par défaut enregistrés")).toBeDefined();
  });

  it("given an hours reminder count outside 1 to 48, then the form refuses it", async () => {
    const calls = givenDefaults([{ kind: "hours_before", hours: 3 }]);
    await renderWithProviders(<DefaultRemindersCard userId="user-1" />);

    fireEvent.change(await screen.findByLabelText("Heures avant"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Choisissez de 1 à 48 heures.")).toBeDefined();
    expect(calls.some((call) => call.method === "PUT")).toBe(false);
  });
});
