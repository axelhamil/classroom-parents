// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { json, renderWithProviders, resetApp, stubApi } from "../../../__tests__/app-harness";
import { EventReminders } from "../components/event-reminders";

const EVENT_ID = "0f6b6a2c-3c1d-4f0e-9a43-5d2b1c7e8f90";
const REMINDERS_PATH = `/events/${EVENT_ID}/reminders`;

const DEFAULTS = {
  customized: false,
  reminders: [
    {
      reminder: { kind: "days_before", days: 2, time: "18:00" },
      dueAt: "2027-03-26T17:00:00.000Z",
      status: "sent",
      fits: true,
    },
    {
      reminder: { kind: "hours_before", hours: 3 },
      dueAt: "2027-03-28T05:00:00.000Z",
      status: "pending",
      fits: true,
    },
  ],
};

const CUSTOM = {
  customized: true,
  reminders: [
    {
      reminder: { kind: "days_before", days: 1, time: "07:30" },
      dueAt: null,
      status: "skipped",
      fits: true,
    },
  ],
};

function givenReminders(
  initial: unknown,
  afterReset: unknown = DEFAULTS,
  onPut: (body: unknown) => Response = (body) => json({ customized: true, reminders: [], body }),
) {
  let current = initial;

  return stubApi(({ method, url, body }) => {
    if (url.pathname !== REMINDERS_PATH) return undefined;
    if (method === "GET") return json(current);
    if (method === "DELETE") {
      current = afterReset;
      return new Response(null, { status: 204 });
    }
    if (method === "PUT") return onPut(body);
    return undefined;
  });
}

function renderReminders(timed = true, needsReview = false) {
  return renderWithProviders(
    <EventReminders eventId={EVENT_ID} timed={timed} needsReview={needsReview} />,
  );
}

const AWAITING_REVIEW = /seront programmés quand vous aurez confirmé cette échéance/;

describe("event reminders", () => {
  afterEach(() => {
    cleanup();
    resetApp();
  });

  it("given the default reminders, then each one shows its delay and its state", async () => {
    givenReminders(DEFAULTS);
    await renderReminders();

    const rows = await screen.findAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^2 jours avant, à 18 h.*Envoyé$/),
      expect.stringMatching(/^3 heures avant.*Planifié$/),
    ]);
    expect(screen.queryByRole("button", { name: "Revenir aux rappels par défaut" })).toBeNull();
  });

  it("given a reminder whose moment is already past, then no send time is promised for it", async () => {
    givenReminders({
      customized: true,
      reminders: [
        {
          reminder: { kind: "days_before", days: 14, time: "07:05" },
          dueAt: "2026-10-30T06:05:00.000Z",
          status: "unplanned",
          fits: true,
        },
      ],
    });
    await renderReminders();

    expect(await screen.findByText("Non planifié")).toBeDefined();
    expect(screen.queryByText(/^Envoi/)).toBeNull();
  });

  it("given the parent removes one reminder and adds a same day one, then the whole list is sent", async () => {
    const calls = givenReminders(DEFAULTS);
    await renderReminders();

    fireEvent.click(await screen.findByRole("button", { name: "Modifier les rappels" }));
    fireEvent.click(screen.getByRole("button", { name: "Retirer le rappel 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un rappel" }));
    const [, added] = screen.getAllByLabelText("Jours avant");
    if (!added) throw new Error("the added reminder has no day field");
    fireEvent.change(added, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
        reminders: [
          { kind: "days_before", days: 2, time: "18:00" },
          { kind: "days_before", days: 0, time: "18:00" },
        ],
      }),
    );
  });

  it("given a default in hours on a deadline without time, when the parent edits and saves, then that default is not sent back", async () => {
    const calls = givenReminders({
      customized: false,
      reminders: [
        {
          reminder: { kind: "days_before", days: 2, time: "18:00" },
          dueAt: "2027-03-26T17:00:00.000Z",
          status: "pending",
          fits: true,
        },
        {
          reminder: { kind: "hours_before", hours: 3 },
          dueAt: null,
          status: "unplanned",
          fits: false,
        },
      ],
    });
    await renderReminders(false);

    fireEvent.click(await screen.findByRole("button", { name: "Modifier les rappels" }));
    expect(screen.getByText(/Un de vos rappels par défaut ne peut pas sonner avant/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
        reminders: [{ kind: "days_before", days: 2, time: "18:00" }],
      }),
    );
  });

  it("given the server refuses one reminder of the list, then the message sits on that reminder", async () => {
    givenReminders(DEFAULTS, DEFAULTS, () =>
      json(
        {
          error: {
            code: "ALERT_AFTER_DEADLINE",
            message: "after deadline",
            metadata: { reminder: { kind: "hours_before", hours: 3 } },
          },
        },
        400,
      ),
    );
    await renderReminders();

    fireEvent.click(await screen.findByRole("button", { name: "Modifier les rappels" }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    const refused = await screen.findByRole("group", { name: "Rappel 2" });
    expect(refused.textContent).toContain("Un rappel doit sonner avant l'échéance.");
    expect(screen.getByRole("group", { name: "Rappel 1" }).textContent).not.toContain(
      "Un rappel doit sonner avant l'échéance.",
    );
  });

  it("given a deadline still to review on the defaults, then it says the defaults wait for its confirmation", async () => {
    givenReminders(DEFAULTS);
    await renderReminders(true, true);

    expect(await screen.findByText(AWAITING_REVIEW)).toBeDefined();
  });

  it("given a deadline still to review with its own reminders, then no wait is announced", async () => {
    givenReminders(CUSTOM);
    await renderReminders(true, true);

    expect(await screen.findByText("Rappels choisis pour cette échéance.")).toBeDefined();
    expect(screen.queryByText(AWAITING_REVIEW)).toBeNull();
  });

  it("given every reminder is removed, then an empty list is sent to silence the deadline", async () => {
    const calls = givenReminders(CUSTOM);
    await renderReminders();

    fireEvent.click(await screen.findByRole("button", { name: "Modifier les rappels" }));
    fireEvent.click(screen.getByRole("button", { name: "Retirer le rappel 1" }));
    expect(screen.getByText("Aucun rappel : rien ne sera envoyé.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ reminders: [] }),
    );
  });

  it("given five reminders, then no sixth one can be added", async () => {
    const five = {
      customized: true,
      reminders: [1, 2, 3, 4, 5].map((days) => ({
        reminder: { kind: "days_before", days, time: "18:00" },
        dueAt: null,
        status: "unplanned",
        fits: true,
      })),
    };
    givenReminders(five);
    await renderReminders();

    fireEvent.click(await screen.findByRole("button", { name: "Modifier les rappels" }));

    expect(screen.getByRole("button", { name: "Ajouter un rappel" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("given a day count past 14, then the form refuses it before calling the server", async () => {
    const calls = givenReminders(CUSTOM);
    await renderReminders();

    fireEvent.click(await screen.findByRole("button", { name: "Modifier les rappels" }));
    fireEvent.change(screen.getByLabelText("Jours avant"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Choisissez de 0 à 14 jours.")).toBeDefined();
    expect(calls.some((call) => call.method === "PUT")).toBe(false);
  });

  it("given customized reminders, when the parent goes back to the defaults, then the defaults come back", async () => {
    const calls = givenReminders(CUSTOM);
    await renderReminders();

    fireEvent.click(await screen.findByRole("button", { name: "Revenir aux rappels par défaut" }));

    expect(await screen.findByText("Rappels par défaut rétablis")).toBeDefined();
    expect(await screen.findByText("2 jours avant, à 18 h")).toBeDefined();
    expect(calls.some((call) => call.method === "DELETE")).toBe(true);
  });

  it("given the reminders fail to load, then it reports the failure instead of claiming none", async () => {
    stubApi(({ url }) =>
      url.pathname === REMINDERS_PATH ? json({ code: "INTERNAL" }, 500) : undefined,
    );
    await renderReminders();

    expect(
      await screen.findByRole("button", { name: "Réessayer" }, { timeout: 10_000 }),
    ).toBeDefined();
    expect(screen.queryByText("Aucun rappel pour cette échéance.")).toBeNull();
  }, 15_000);
});
