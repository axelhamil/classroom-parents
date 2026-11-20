// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, renderWithProviders, resetApp, stubApi } from "../../../__tests__/app-harness";
import {
  ensurePointerCapture,
  ensureResizeObserver,
  ensureScrollIntoView,
} from "../../../__tests__/match-media";
import { at } from "../../../__tests__/week-fixtures";
import { LanguageAndRegionCard } from "../components/language-and-region-card";
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
  country?: string | null;
}

function isChoiceBody(body: unknown): body is { choice: Choice } {
  return typeof body === "object" && body !== null && "choice" in body;
}

function isObject(body: unknown): body is object {
  return typeof body === "object" && body !== null;
}

function givenSchoolCalendar({ choice = null, suggestedCountry = null, country = null }: Given) {
  let saved = choice;
  let preferences = { locale: "fr", timeZone: "Europe/Paris", country, extractionEnabled: true };

  return stubApi(({ method, url, body }) => {
    const path = url.pathname;
    const regionsOf = url.searchParams.get("country") ?? "";
    if (path === "/assistant/preferences") return json(preferences);
    if (
      path === "/assistant/preferences/language-and-region" &&
      method === "PUT" &&
      isObject(body)
    ) {
      preferences = { ...preferences, ...body };
      return json(preferences);
    }
    if (path === "/school-calendar/settings")
      return json({
        choice: saved,
        periods: [],
        suggestedCountry,
        countries: COUNTRIES,
        academies: ACADEMIES,
      });
    if (path === "/school-calendar/regions") return json({ regions: REGIONS[regionsOf] ?? [] });
    if (path === "/school-calendar/preview")
      return json({
        holidays: [{ name: "Vacances de Noël", startsOn: "2026-12-19", endsOn: "2027-01-03" }],
        bankHoliday: { date: "2026-12-25", name: "Noël" },
        schoolHolidaysCovered: regionsOf !== "ES",
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
  fireEvent.click(await screen.findByRole("combobox", { name: "Pays" }));
  fireEvent.change(await screen.findByRole("combobox", { name: "Rechercher un pays" }), {
    target: { value: search },
  });
  fireEvent.click(await screen.findByRole("option", { name: country }));
}

function savedChoices(calls: ReturnType<typeof givenSchoolCalendar>) {
  return calls
    .filter(({ method, url }) => method === "PUT" && url.pathname === "/school-calendar/choice")
    .map(({ body }) => body);
}

async function lastSavedChoice(calls: ReturnType<typeof givenSchoolCalendar>, count: number) {
  await waitFor(() => expect(savedChoices(calls)).toHaveLength(count));

  return savedChoices(calls).at(-1);
}

describe("school holidays card", () => {
  beforeEach(() => {
    at("2026-11-12T09:00:00.000Z");
    ensureResizeObserver();
    ensurePointerCapture();
    ensureScrollIntoView();
  });

  afterEach(() => {
    cleanup();
    resetApp();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("given a parent in Switzerland with no calendar yet, when they show it and pick Geneva, then the Geneva calendar is saved", async () => {
    const calls = givenSchoolCalendar({ country: "CH" });
    await renderWithProviders(<SchoolHolidaysCard userId="user-1" />);

    expect(await screen.findByText("Vacances et jours fériés : Suisse")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Afficher" }));

    expect(await lastSavedChoice(calls, 1)).toEqual({
      choice: { country: "CH", region: null, schoolHolidays: "official" },
    });
    await choose("Région", "Genève");

    expect(await lastSavedChoice(calls, 2)).toEqual({
      choice: { country: "CH", region: "CH-GE", schoolHolidays: "official" },
    });
    expect(await screen.findByText("Enregistré")).toBeDefined();
  });

  it("given a French parent who picks their academy, then the academy's zone is proposed and saved", async () => {
    const calls = givenSchoolCalendar({
      country: "FR",
      choice: { country: "FR", region: "zone-c", schoolHolidays: "official" },
    });
    await renderWithProviders(<SchoolHolidaysCard userId="user-1" />);

    await choose("Académie", "Rennes");

    expect(await lastSavedChoice(calls, 1)).toEqual({
      choice: { country: "FR", region: "zone-b", schoolHolidays: "official" },
    });
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Zone" }).textContent).toBe("Zone B"),
    );
  });

  it("given a parent in Morocco, where no school calendar is published, when they show the calendar, then the card says so and offers the school's own holidays at once", async () => {
    const calls = givenSchoolCalendar({ country: "MA" });
    await renderWithProviders(<SchoolHolidaysCard userId="user-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Afficher" }));

    expect(await lastSavedChoice(calls, 1)).toEqual({
      choice: { country: "MA", region: null, schoolHolidays: "own" },
    });
    expect(await screen.findByText("Maroc : aucun calendrier scolaire publié")).toBeDefined();
    expect(screen.getByLabelText("Lien du calendrier (.ics)")).toBeDefined();
    expect(screen.getByLabelText("Fichier du calendrier (.ics)")).toBeDefined();
    expect(screen.getByText("Aucune période pour l'instant.")).toBeDefined();
  });

  it("given a parent in Morocco who keeps the school's own holidays, when they type a first holiday, then the period is saved", async () => {
    const calls = givenSchoolCalendar({
      country: "MA",
      choice: { country: "MA", region: null, schoolHolidays: "own" },
    });
    await renderWithProviders(<SchoolHolidaysCard userId="user-1" />);

    fireEvent.change(await screen.findByLabelText("Nom"), { target: { value: "Aïd al-Fitr" } });
    fireEvent.change(screen.getByLabelText("Premier jour"), { target: { value: "2027-03-09" } });
    fireEvent.change(screen.getByLabelText("Dernier jour"), { target: { value: "2027-03-11" } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() =>
      expect(
        calls.filter(({ method }) => method !== "GET").map(({ method, body }) => [method, body]),
      ).toEqual([["POST", { name: "Aïd al-Fitr", startsOn: "2027-03-09", endsOn: "2027-03-11" }]]),
    );
  });

  it("given a country whose holidays of the year are not published yet, then the preview offers the school's own calendar", async () => {
    givenSchoolCalendar({
      country: "ES",
      choice: { country: "ES", region: null, schoolHolidays: "official" },
    });
    await renderWithProviders(<SchoolHolidaysCard userId="user-1" />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Utiliser le calendrier de l'école" }),
    );

    expect(await screen.findByLabelText("Lien du calendrier (.ics)")).toBeDefined();
  });

  it("given a parent in Morocco who does not know the school's holidays, when they choose the school's own calendar, then it is saved", async () => {
    const calls = givenSchoolCalendar({
      country: "MA",
      choice: { country: "MA", region: null, schoolHolidays: "unknown" },
    });
    await renderWithProviders(<SchoolHolidaysCard userId="user-1" />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Utiliser le calendrier de l'école" }),
    );

    expect(await lastSavedChoice(calls, 1)).toEqual({
      choice: { country: "MA", region: null, schoolHolidays: "own" },
    });
  });

  it("given a country with no school calendar at all, then the card says so and offers nothing to save", async () => {
    const calls = givenSchoolCalendar({ country: "JP" });
    await renderWithProviders(<SchoolHolidaysCard userId="user-1" />);

    expect(await screen.findByText("Japon : aucun calendrier scolaire")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Afficher" })).toBeNull();
    expect(savedChoices(calls)).toEqual([]);
  });

  describe("given a school calendar saved in France", () => {
    const FRENCH_CALENDAR = { country: "FR", region: "zone-c", schoolHolidays: "official" };

    it("when the parent moves to Switzerland in Langue et région, then the calendar follows to the whole of Switzerland", async () => {
      const calls = givenSchoolCalendar({ country: "FR", choice: FRENCH_CALENDAR });
      await renderWithProviders(
        <>
          <LanguageAndRegionCard userId="user-1" />
          <SchoolHolidaysCard userId="user-1" />
        </>,
      );
      await screen.findByRole("combobox", { name: "Académie" });

      await searchCountry("suis", "Suisse");

      expect(await lastSavedChoice(calls, 1)).toEqual({
        choice: { country: "CH", region: null, schoolHolidays: "official" },
      });
    });

    it("when the parent moves to a country with no school calendar, then the calendar choice is cleared", async () => {
      const calls = givenSchoolCalendar({ country: "FR", choice: FRENCH_CALENDAR });
      await renderWithProviders(
        <>
          <LanguageAndRegionCard userId="user-1" />
          <SchoolHolidaysCard userId="user-1" />
        </>,
      );
      await screen.findByRole("combobox", { name: "Académie" });

      await searchCountry("japon", "Japon");

      expect(await lastSavedChoice(calls, 1)).toEqual({ choice: null });
    });
  });
});
