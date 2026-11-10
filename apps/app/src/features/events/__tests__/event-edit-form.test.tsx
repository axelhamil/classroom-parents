// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ApiCall,
  json,
  queryClient,
  renderAppAt,
  resetApp,
  stubApi,
} from "../../../__tests__/app-harness";
import { EVENT_BASE } from "../../../__tests__/event-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({ theme: "system", resolvedTheme: "light", setTheme: () => undefined }),
}));

const EVENT = {
  ...EVENT_BASE,
  title: "Contrôle de mathématiques sur les fractions",
  description: "Réviser le chapitre 3.",
  category: "assessment",
  deadlineDate: "2027-03-26",
  deadlineTime: "08:30",
  deadlineAt: "2027-03-26T07:30:00.000Z",
};

const EDIT_PATH = `/events/${EVENT.id}/edit`;

const DEADLINE_REFUSED =
  "Cette date ou cette heure n'existe pas. Choisissez une date réelle et une heure entre 00:00 et 23:59, hors de 02:00 à 02:59 le jour du passage à l'heure d'été.";

const deadlineRefused = () =>
  json({ error: { code: "EVENT_DEADLINE_INVALID", message: "invalid deadline" } }, 400);

function givenEvent(
  patchResponse: () => Response = () => json({ ...EVENT, edited: true }),
  detail: () => Response = () => json(EVENT),
) {
  return stubApi(({ method, url }) => {
    if (url.pathname === `/events/${EVENT.id}` && method === "GET") return detail();
    if (url.pathname === `/events/${EVENT.id}` && method === "PATCH") return patchResponse();
    if (url.pathname === `/events/${EVENT.id}/reminders`)
      return json({ customized: false, reminders: [] });
    if (url.pathname === "/children") return json([]);
    if (url.pathname === "/sync") return json({ status: "requested" }, 202);
    return undefined;
  });
}

const EDITED_BY_YOU = "Modifié par vous : Classroom ne le mettra plus à jour.";

function descriptionOf(label: string): string {
  const ids = screen.getByLabelText(label).getAttribute("aria-describedby")?.split(" ") ?? [];

  return ids
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join("")
    .trim();
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

  it("given the API refuses a changed date, then its message shows on the date field", async () => {
    givenEvent(deadlineRefused);
    await renderAppAt(EDIT_PATH);
    await openForm();

    fireEvent.change(screen.getByLabelText("Heure (facultative)"), { target: { value: "02:30" } });
    fireEvent.change(screen.getByLabelText("Pour le"), { target: { value: "2027-03-28" } });
    save();

    expect(await screen.findByText(DEADLINE_REFUSED)).toBeDefined();
    expect(screen.getByLabelText("Pour le").getAttribute("aria-invalid")).toBe("true");
  });

  it("given the API refuses a time skipped by the spring change, then its message shows on the time field", async () => {
    givenEvent(deadlineRefused);
    await renderAppAt(EDIT_PATH);
    await openForm();

    fireEvent.change(screen.getByLabelText("Heure (facultative)"), { target: { value: "02:30" } });
    save();

    expect(await screen.findByText(DEADLINE_REFUSED)).toBeDefined();
    expect(screen.getByLabelText("Heure (facultative)").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Pour le").getAttribute("aria-invalid")).toBe("false");
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

  it("given a background reload fails, then the typing stays and a non-blocking message shows", async () => {
    let detailFails = false;
    givenEvent(undefined, () => (detailFails ? json({ code: "HTTP_500" }, 500) : json(EVENT)));
    await renderAppAt(EDIT_PATH);
    await openForm();

    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Contrôle reporté" } });
    detailFails = true;
    await act(() => queryClient.invalidateQueries({ queryKey: ["events"] }));

    expect(
      await screen.findByText(
        "La fiche n'a pas pu être rechargée. Votre saisie est conservée.",
        undefined,
        { timeout: 3000 },
      ),
    ).toBeDefined();
    expect(screen.getByDisplayValue("Contrôle reporté")).toBeDefined();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toHaveProperty("disabled", false);
  });

  it("given the leave dialog open, when the parent presses Escape, then it closes and the page stays", async () => {
    givenEvent();
    const router = await renderAppAt(EDIT_PATH);
    await openForm();

    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Contrôle reporté" } });
    void router.navigate({ to: "/history" });
    const dialog = await screen.findByRole("alertdialog", { name: "Quitter sans enregistrer ?" });
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(dialog.isConnected).toBe(false));
    expect(router.state.location.pathname).toBe(EDIT_PATH);
    expect(screen.getByDisplayValue("Contrôle reporté")).toBeDefined();
  });

  it("given the title and the deadline edited before, then only those fields say they no longer follow Classroom", async () => {
    givenEvent(undefined, () =>
      json({ ...EVENT, edited: true, editedFields: ["title", "deadline"] }),
    );
    await renderAppAt(EDIT_PATH);
    await openForm();

    expect(descriptionOf("Titre")).toBe(EDITED_BY_YOU);
    expect(descriptionOf("Pour le")).toBe(EDITED_BY_YOU);
    expect(descriptionOf("Heure (facultative)")).toBe(EDITED_BY_YOU);
    expect(descriptionOf("Description")).toBe("");
    expect(descriptionOf("Type")).toBe("");
  });
});
