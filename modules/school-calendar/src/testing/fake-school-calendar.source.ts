import { Result } from "@packages/ddd-kit";
import type {
  ISchoolCalendarSource,
  Region,
} from "../application/ports/school-calendar-source.port";
import type { CalendarEntry, CalendarFeed } from "../domain/calendar/calendar-feed";
import type { SchoolZoneValue } from "../domain/value-objects/school-zone.vo";

type MainlandZone = Extract<SchoolZoneValue, "zone-a" | "zone-b" | "zone-c">;

interface Period {
  name: string;
  startsOn: string;
  endsOn: string;
}

const holiday = (name: string, startsOn: string, endsOn: string): Period => ({
  name,
  startsOn,
  endsOn,
});

const SHARED: Record<string, Period[]> = {
  "2025-2026": [
    holiday("Vacances de la Toussaint", "2025-10-18", "2025-11-02"),
    holiday("Vacances de Noël", "2025-12-20", "2026-01-04"),
    holiday("Pont de l'Ascension", "2026-05-14", "2026-05-17"),
    holiday("Vacances d'Été", "2026-07-04", "2026-08-31"),
  ],
  "2026-2027": [
    holiday("Vacances de la Toussaint", "2026-10-17", "2026-11-01"),
    holiday("Vacances de Noël", "2026-12-19", "2027-01-03"),
    holiday("Pont de l'Ascension", "2027-05-07", "2027-05-07"),
    holiday("Vacances d'Été", "2027-07-03", "2027-09-01"),
  ],
};

const BY_ZONE: Record<MainlandZone, Record<string, Period[]>> = {
  "zone-a": {
    "2025-2026": [
      holiday("Vacances d'Hiver", "2026-02-07", "2026-02-22"),
      holiday("Vacances de Printemps", "2026-04-04", "2026-04-19"),
    ],
    "2026-2027": [
      holiday("Vacances d'Hiver", "2027-02-13", "2027-02-28"),
      holiday("Vacances de Printemps", "2027-04-10", "2027-04-25"),
    ],
  },
  "zone-b": {
    "2025-2026": [
      holiday("Vacances d'Hiver", "2026-02-14", "2026-03-01"),
      holiday("Vacances de Printemps", "2026-04-11", "2026-04-26"),
    ],
    "2026-2027": [
      holiday("Vacances d'Hiver", "2027-02-20", "2027-03-07"),
      holiday("Vacances de Printemps", "2027-04-17", "2027-05-02"),
    ],
  },
  "zone-c": {
    "2025-2026": [
      holiday("Vacances d'Hiver", "2026-02-21", "2026-03-08"),
      holiday("Vacances de Printemps", "2026-04-18", "2026-05-03"),
    ],
    "2026-2027": [
      holiday("Vacances d'Hiver", "2027-02-06", "2027-02-21"),
      holiday("Vacances de Printemps", "2027-04-03", "2027-04-18"),
    ],
  },
};

const MAINLAND_BANK_HOLIDAYS: Record<number, Record<string, string>> = {
  2025: {
    "2025-01-01": "1er janvier",
    "2025-04-21": "Lundi de Pâques",
    "2025-05-01": "1er mai",
    "2025-05-08": "8 mai",
    "2025-05-29": "Ascension",
    "2025-06-09": "Lundi de Pentecôte",
    "2025-07-14": "14 juillet",
    "2025-08-15": "Assomption",
    "2025-11-01": "Toussaint",
    "2025-11-11": "11 novembre",
    "2025-12-25": "Jour de Noël",
  },
  2026: {
    "2026-01-01": "1er janvier",
    "2026-04-06": "Lundi de Pâques",
    "2026-05-01": "1er mai",
    "2026-05-08": "8 mai",
    "2026-05-14": "Ascension",
    "2026-05-25": "Lundi de Pentecôte",
    "2026-07-14": "14 juillet",
    "2026-08-15": "Assomption",
    "2026-11-01": "Toussaint",
    "2026-11-11": "11 novembre",
    "2026-12-25": "Jour de Noël",
  },
  2027: {
    "2027-01-01": "1er janvier",
    "2027-03-29": "Lundi de Pâques",
    "2027-05-01": "1er mai",
    "2027-05-06": "Ascension",
    "2027-05-08": "8 mai",
    "2027-05-17": "Lundi de Pentecôte",
    "2027-07-14": "14 juillet",
    "2027-08-15": "Assomption",
    "2027-11-01": "Toussaint",
    "2027-11-11": "11 novembre",
    "2027-12-25": "Jour de Noël",
  },
};

const GENEVA = ["CH-GE"];

const GENEVA_SCHOOL_HOLIDAYS: Record<string, Period[]> = {
  "2026": [
    holiday("Vacances de Noël et Nouvel An", "2025-12-22", "2026-01-02"),
    holiday("Vacances de février", "2026-02-23", "2026-02-27"),
    holiday("Vacances de Pâques", "2026-04-03", "2026-04-17"),
    holiday("Pont de l'Ascension", "2026-05-14", "2026-05-15"),
    holiday("Vacances d'été", "2026-06-29", "2026-08-16"),
    holiday("Vacances d'automne", "2026-10-19", "2026-10-23"),
    holiday("Vacances de Noël et Nouvel An", "2026-12-24", "2027-01-08"),
  ],
  "2027": [
    holiday("Vacances de Noël et Nouvel An", "2026-12-24", "2027-01-08"),
    holiday("Vacances de février", "2027-02-15", "2027-02-19"),
    holiday("Vacances de Pâques", "2027-03-26", "2027-04-09"),
    holiday("Pont de l'Ascension", "2027-05-06", "2027-05-07"),
    holiday("Vacances d'été", "2027-07-05", "2027-08-25"),
    holiday("Vacances d'automne", "2027-10-25", "2027-10-29"),
  ],
};

const SWISS_REGIONS: Region[] = [
  { code: "CH-GE", names: { fr: "Genève", de: "Genf", en: "Geneva" } },
  { code: "CH-VD", names: { fr: "Vaud", de: "Waadt", en: "Vaud" } },
  { code: "CH-ZH", names: { fr: "Zurich", de: "Zürich", en: "Zurich" } },
];

interface PublicHoliday {
  date: string;
  name: string;
  regions: string[] | null;
}

const PUBLIC_HOLIDAYS: Record<string, PublicHoliday[]> = {
  "CH:2026": [
    { date: "2026-01-01", name: "New Year's Day", regions: null },
    { date: "2026-04-03", name: "Good Friday", regions: ["CH-GE", "CH-VD", "CH-ZH"] },
    { date: "2026-05-14", name: "Ascension Day", regions: null },
    { date: "2026-08-01", name: "Swiss National Day", regions: null },
    { date: "2026-09-10", name: "Geneva Prayday", regions: GENEVA },
    { date: "2026-12-25", name: "Christmas Day", regions: null },
    { date: "2026-12-31", name: "Restoration Day", regions: GENEVA },
  ],
  "CH:2027": [
    { date: "2027-01-01", name: "New Year's Day", regions: null },
    { date: "2027-05-06", name: "Ascension Day", regions: null },
    { date: "2027-08-01", name: "Swiss National Day", regions: null },
    { date: "2027-12-25", name: "Christmas Day", regions: null },
  ],
  "MA:2026": [
    { date: "2026-01-01", name: "New Year's Day", regions: null },
    { date: "2026-01-11", name: "Proclamation of Independence", regions: null },
    { date: "2026-01-14", name: "Amazigh New Year", regions: null },
    { date: "2026-05-01", name: "Labour Day", regions: null },
    { date: "2026-07-30", name: "Enthronement", regions: null },
    { date: "2026-08-14", name: "Zikra Oued Ed-Dahab", regions: null },
    { date: "2026-08-20", name: "Revolution of the King and the People", regions: null },
    { date: "2026-08-21", name: "Youth Day", regions: null },
    { date: "2026-10-31", name: "Unity Day", regions: null },
    { date: "2026-11-06", name: "Green March", regions: null },
    { date: "2026-11-18", name: "Independence Day", regions: null },
  ],
  "MA:2027": [
    { date: "2027-01-01", name: "New Year's Day", regions: null },
    { date: "2027-01-11", name: "Proclamation of Independence", regions: null },
    { date: "2027-01-14", name: "Amazigh New Year", regions: null },
    { date: "2027-05-01", name: "Labour Day", regions: null },
  ],
  "US:2026": [
    { date: "2026-01-01", name: "New Year's Day", regions: null },
    { date: "2026-07-03", name: "Independence Day", regions: null },
    { date: "2026-11-26", name: "Thanksgiving Day", regions: null },
    { date: "2026-12-25", name: "Christmas Day", regions: null },
  ],
  "US:2027": [
    { date: "2027-01-01", name: "New Year's Day", regions: null },
    { date: "2027-01-18", name: "Martin Luther King, Jr. Day", regions: null },
  ],
};

function frenchEntry({ name, startsOn, endsOn }: Period): CalendarEntry {
  return { names: { fr: name }, startsOn, endsOn, regions: null };
}

function isMainland(zone: SchoolZoneValue): zone is MainlandZone {
  return zone in BY_ZONE;
}

function frenchHolidays(zone: SchoolZoneValue, schoolYear: string): CalendarEntry[] {
  if (!isMainland(zone)) return [];

  return [...(SHARED[schoolYear] ?? []), ...(BY_ZONE[zone][schoolYear] ?? [])].map(frenchEntry);
}

function frenchBankHolidays(territory: string, year: string): CalendarEntry[] {
  if (territory !== "metropole") return [];

  return Object.entries(MAINLAND_BANK_HOLIDAYS[Number(year)] ?? {}).map(([date, name]) =>
    frenchEntry({ name, startsOn: date, endsOn: date }),
  );
}

function schoolHolidays(country: string, year: string): CalendarEntry[] {
  if (country !== "CH") return [];

  return (GENEVA_SCHOOL_HOLIDAYS[year] ?? []).map(({ name, startsOn, endsOn }) => ({
    names: { fr: name },
    startsOn,
    endsOn,
    regions: GENEVA,
  }));
}

function publicHolidays(country: string, year: string): CalendarEntry[] {
  return (PUBLIC_HOLIDAYS[`${country}:${year}`] ?? []).map(({ date, name, regions }) => ({
    names: { en: name },
    startsOn: date,
    endsOn: date,
    regions,
  }));
}

function entriesOf(feed: CalendarFeed, period: string): CalendarEntry[] {
  switch (feed.provider) {
    case "education-nationale":
      return frenchHolidays(feed.zone, period);
    case "api-gouv":
      return frenchBankHolidays(feed.territory, period);
    case "openholidays":
      return schoolHolidays(feed.country, period);
    case "nager-date":
      return publicHolidays(feed.country, period);
  }
}

/**
 * A copy of the real official data the checks and `FAKE_PROVIDERS` read: mainland France
 * 2025-2027, Geneva school holidays (OpenHolidays), Swiss, Moroccan and US public holidays
 * (Nager.Date). Spain has no school holidays here, like OpenHolidays before publication.
 */
export function fakeSchoolCalendarSource(): ISchoolCalendarSource {
  return {
    entries: async (feed, period) => Result.ok(entriesOf(feed, period)),
    regions: async (country) => Result.ok(country === "CH" ? SWISS_REGIONS : []),
  };
}
