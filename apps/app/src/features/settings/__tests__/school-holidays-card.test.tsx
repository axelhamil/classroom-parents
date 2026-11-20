// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, renderWithProviders, resetApp, stubApi } from "../../../__tests__/app-harness";
import { at } from "../../../__tests__/week-fixtures";
import { SchoolHolidaysCard } from "../components/school-holidays-card";

const COUNTRIES = [
  { code: "FR", officialSchoolHolidays: true, bankHolidays: true },
  { code: "CH", officialSchoolHolidays: true, bankHolidays: true },
  { code: "MA", officialSchoolHolidays: false, bankHolidays: true },
  { code: "ES", officialSchoolHolidays: true, bankHolidays: true },
];

const REGIONS: Record<string, { code: string; name: string }[]> = {
  FR: [
    { code: "zone-b", name: "Zone B" },
    { code: "zone-c", name: "Zone C" },
  ],
  CH: [{ code: "CH-GE", name: "Genève" }],
  MA: [],
  ES: [],
};

const ACADEMIES = [{ id: "rennes", name: "Rennes", zone: "zone-b" }];

type Choice = { country: string; region: string | null; schoolHolidays: string } | null;

interface Given {
  choice?: Choice;
  suggestedCountry?: string | null;
}

function isChoiceBody(body: unknown): body is { choice: Choice } {
  return typeof body === "object" && body !== null && "choice" in body;
}

function givenSchoolCalendar({ choice = null, suggestedCountry = null }: Given) {
  let saved = choice;

  return stubApi(({ method, url, body }) => {
    const path = url.pathname;
    const country = url.searchParams.get("country") ?? "";
    if (path === "/school-calendar/settings")
      return json({
        choice: saved,
        periods: [],
        suggestedCountry,
        countries: COUNTRIES,
        academies: ACADEMIES,
      });
    if (path === "/school-calendar/regions") return json({ regions: REGIONS[country] ?? [] });
    if (path === "/school-calendar/preview")
      return json({
        holidays: [{ name: "Vacances de Noël", startsOn: "2026-12-19", endsOn: "2027-01-03" }],
        bankHoliday: { date: "2026-12-25", name: "Noël" },
        schoolHolidaysCovered: country !== "ES",
      });
    if (path === "/school-calendar/choice" && method === "PUT" && isChoiceBody(body)) {
      saved = body.choice;
      return json({ choice: saved });
    }
    if (path === "/school-calendar/periods" && method === "POST")
      return new Response(null, { status: 204 });
    return undefined;
  });
}

async function choose(label: string, option: string) {
  fireEvent.keyDown(await screen.findByRole("combobox", { name: label }), { key: "Enter" });
  fireEvent.keyDown(await screen.findByRole("option", { name: option }), { key: "Enter" });
}

async function searchCountry(search: string, country: string) {
  fireEvent.click(await screen.findByRole("combobox", { name: "Pays de l'école" }));
  fireEvent.change(await screen.findByRole("combobox", { name: "Rechercher un pays" }), {
    target: { value: search },
  });
  fireEvent.click(await screen.findByRole("option", { name: country }));
}

async function savedChoice(calls: ReturnType<typeof givenSchoolCalendar>) {
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() => expect(calls.some((call) => call.method === "PUT")).toBe(true));

  return calls.find((call) => call.method === "PUT")?.body;
}

describe("school holidays card", () => {
  beforeEach(() => {
    at("2026-11-12T09:00:00.000Z");
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
    vi.useRealTimers();
  });

  it("given a parent in Switzerland who has not chosen yet, then their country is proposed and the Geneva calendar is saved", async () => {
    const calls = givenSchoolCalendar({ suggestedCountry: "CH" });
    await renderWithProviders(<SchoolHolidaysCard userId="user-1" />);

    expect(
      await screen.findByText("Proposé d'après votre pays dans Langue et région."),
    ).toBeDefined();
    expect(screen.getByRole("combobox", { name: "Pays de l'école" }).textContent).toContain(
      "Suisse",
    );
    await choose("Région", "Genève");

    expect(await savedChoice(calls)).toEqual({
      choice: { country: "CH", region: "CH-GE", schoolHolidays: "official" },
    });
    expect(await screen.findByText("Calendrier scolaire enregistré")).toBeDefined();
  });

  it("given a French parent who picks their academy, then the academy's zone is proposed and saved", async () => {
    const calls = givenSchoolCalendar({ suggestedCountry: "FR" });
    await renderWithProviders(<SchoolHolidaysCard userId="user-1" />);

    await choose("Académie", "Rennes");
    expect(screen.getByRole("combobox", { name: "Zone" }).textContent).toBe("Zone B");

    expect(await savedChoice(calls)).toEqual({
      choice: { country: "FR", region: "zone-b", schoolHolidays: "official" },
    });
  });

  it("given a parent in Morocco, where no school calendar is published, then the card says so and offers the school's own holidays at once", async () => {
    givenSchoolCalendar({
      choice: { country: "FR", region: "zone-c", schoolHolidays: "official" },
    });
    await renderWithProviders(<SchoolHolidaysCard userId="user-1" />);

    await searchCountry("maro", "Maroc");

    expect(screen.getByText("Maroc : aucun calendrier scolaire publié")).toBeDefined();
    expect(screen.getByLabelText("Lien du calendrier (.ics)")).toBeDefined();
    expect(screen.getByLabelText("Fichier du calendrier (.ics)")).toBeDefined();
    expect(screen.getByText("Aucune période pour l'instant.")).toBeDefined();
  });

  it("given a parent in Morocco who types a first holiday, then the calendar is saved before the period", async () => {
    const calls = givenSchoolCalendar({
      choice: { country: "FR", region: "zone-c", schoolHolidays: "official" },
    });
    await renderWithProviders(<SchoolHolidaysCard userId="user-1" />);

    await searchCountry("maro", "Maroc");
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Aïd al-Fitr" } });
    fireEvent.change(screen.getByLabelText("Premier jour"), { target: { value: "2027-03-09" } });
    fireEvent.change(screen.getByLabelText("Dernier jour"), { target: { value: "2027-03-11" } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() =>
      expect(
        calls.filter(({ method }) => method !== "GET").map(({ method, body }) => [method, body]),
      ).toEqual([
        ["PUT", { choice: { country: "MA", region: null, schoolHolidays: "own" } }],
        ["POST", { name: "Aïd al-Fitr", startsOn: "2027-03-09", endsOn: "2027-03-11" }],
      ]),
    );
  });

  it("given a country whose holidays of the year are not published yet, then the preview offers the school's own calendar", async () => {
    givenSchoolCalendar({ suggestedCountry: "ES" });
    await renderWithProviders(<SchoolHolidaysCard userId="user-1" />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Utiliser le calendrier de l'école" }),
    );

    expect(await screen.findByLabelText("Lien du calendrier (.ics)")).toBeDefined();
  });

  it("given a parent who does not know the school's country, then no calendar is saved", async () => {
    const calls = givenSchoolCalendar({
      choice: { country: "FR", region: "zone-c", schoolHolidays: "official" },
    });
    await renderWithProviders(<SchoolHolidaysCard userId="user-1" />);

    await searchCountry("sais", "Je ne sais pas");

    expect(await savedChoice(calls)).toEqual({ choice: null });
  });
});
