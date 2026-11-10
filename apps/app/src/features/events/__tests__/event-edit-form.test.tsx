// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ApiCall, json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({ theme: "system", resolvedTheme: "light", setTheme: () => undefined }),
}));

const EVENT = {
  id: "0f6b6a2c-3c1d-4f0e-9a43-5d2b1c7e8f90",
  childId: "8d0c1f4e-6a51-4c55-9c39-3a1f1e0b7a11",
  title: "Contrôle de mathématiques sur les fractions",
  description: "Réviser le chapitre 3.",
  category: "assessment",
  deadlineDate: "2027-03-26",
  deadlineTime: "08:30",
  deadlineAt: "2027-03-26T07:30:00.000Z",
  status: "confirmed",
  source: "announcement",
  done: false,
  announcementUrl: "https://classroom.google.com/c/abc/p/def",
  receivedAt: "2026-11-05T10:00:00.000Z",
  edited: false,
};

const EDIT_PATH = `/events/${EVENT.id}/edit`;

function givenEvent(patchResponse: () => Response = () => json({ ...EVENT, edited: true })) {
  return stubApi(({ method, url }) => {
    if (url.pathname === `/events/${EVENT.id}` && method === "GET") return json(EVENT);
    if (url.pathname === `/events/${EVENT.id}` && method === "PATCH") return patchResponse();
    if (url.pathname === `/events/${EVENT.id}/alert`) return json({ alert: null });
    if (url.pathname === "/children") return json([]);
    if (url.pathname === "/sync") return json({ status: "requested" }, 202);
    return undefined;
  });
}

function patches(calls: ApiCall[]): ApiCall[] {
  return calls.filter((call) => call.method === "PATCH");
}

async function openForm(): Promise<void> {
  await screen.findByDisplayValue(EVENT.title);
}

function save(): void {
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
}

describe("event edit form", () => {
  afterEach(() => {
    cleanup();
    resetApp();
  });

  it("given the event untouched, then saving is disabled", async () => {
    givenEvent();
    await renderAppAt(EDIT_PATH);
    await openForm();

    expect(screen.getByRole("button", { name: "Enregistrer" })).toHaveProperty("disabled", true);
  });

  it("given an empty title, when saving, then a French error shows and no request leaves", async () => {
    const calls = givenEvent();
    await renderAppAt(EDIT_PATH);
    await openForm();

    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "   " } });
    save();

    expect(await screen.findByText("Ce champ est obligatoire.")).toBeDefined();
    expect(patches(calls)).toEqual([]);
  });

  it("given a 121 character title, when saving, then it is refused with the API bound", async () => {
    const calls = givenEvent();
    await renderAppAt(EDIT_PATH);
    await openForm();

    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "a".repeat(121) } });
    save();

    expect(await screen.findByText("Doit contenir au plus 120 caractères.")).toBeDefined();
    expect(patches(calls)).toEqual([]);
  });

  it("given only the deadline changed, when saving, then the request carries only the date and the detail opens", async () => {
    const calls = givenEvent();
    const router = await renderAppAt(EDIT_PATH);
    await openForm();

    fireEvent.change(screen.getByLabelText("Pour le"), { target: { value: "2027-03-29" } });
    save();

    await waitFor(() =>
      expect(patches(calls).map((call) => call.body)).toEqual([{ deadlineDate: "2027-03-29" }]),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe(`/events/${EVENT.id}`));
  });

  it("given the time is emptied, when saving, then the request clears the time", async () => {
    const calls = givenEvent();
    await renderAppAt(EDIT_PATH);
    await openForm();

    fireEvent.change(screen.getByLabelText("Heure (facultative)"), { target: { value: "" } });
    save();

    await waitFor(() =>
      expect(patches(calls).map((call) => call.body)).toEqual([{ deadlineTime: "clear" }]),
    );
  });

  it("given the API refuses the deadline, then its message shows on the date field", async () => {
    givenEvent(() =>
      json({ error: { code: "EVENT_DEADLINE_INVALID", message: "invalid deadline" } }, 400),
    );
    await renderAppAt(EDIT_PATH);
    await openForm();

    fireEvent.change(screen.getByLabelText("Heure (facultative)"), { target: { value: "02:30" } });
    fireEvent.change(screen.getByLabelText("Pour le"), { target: { value: "2027-03-28" } });
    save();

    expect(
      await screen.findByText(
        "Cette date ou cette heure n'existe pas. Choisissez une date réelle et une heure entre 00:00 et 23:59.",
      ),
    ).toBeDefined();
    expect(screen.getByLabelText("Pour le").getAttribute("aria-invalid")).toBe("true");
  });

  it("given unsaved changes, when the parent leaves, then the app asks first and keeps the page on stay", async () => {
    givenEvent();
    const router = await renderAppAt(EDIT_PATH);
    await openForm();

    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Contrôle reporté" } });
    void router.navigate({ to: "/history" });

    const dialog = await screen.findByRole("alertdialog", { name: "Quitter sans enregistrer ?" });
    fireEvent.click(screen.getByRole("button", { name: "Rester" }));

    await waitFor(() => expect(dialog.isConnected).toBe(false));
    expect(router.state.location.pathname).toBe(EDIT_PATH);
    expect(screen.getByDisplayValue("Contrôle reporté")).toBeDefined();
  });
});
