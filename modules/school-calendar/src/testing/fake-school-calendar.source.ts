import { Result } from "@packages/ddd-kit";
import type {
  BankHoliday,
  ISchoolCalendarSource,
  SchoolHoliday,
} from "../application/ports/school-calendar-source.port";
import type { SchoolZoneValue } from "../domain/value-objects/school-zone.vo";

type MainlandZone = Extract<SchoolZoneValue, "zone-a" | "zone-b" | "zone-c">;

const holiday = (name: string, startsOn: string, endsOn: string): SchoolHoliday => ({
  name,
  startsOn,
  endsOn,
});

const SHARED: Record<string, SchoolHoliday[]> = {
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

const BY_ZONE: Record<MainlandZone, Record<string, SchoolHoliday[]>> = {
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

function isMainland(zone: SchoolZoneValue): zone is MainlandZone {
  return zone in BY_ZONE;
}

function holidaysOf(zone: SchoolZoneValue, schoolYear: string): SchoolHoliday[] {
  if (!isMainland(zone)) return [];

  return [...(SHARED[schoolYear] ?? []), ...(BY_ZONE[zone][schoolYear] ?? [])];
}

function bankHolidaysOf(territory: string, year: number): BankHoliday[] {
  if (territory !== "metropole") return [];

  return Object.entries(MAINLAND_BANK_HOLIDAYS[year] ?? {}).map(([date, name]) => ({
    date,
    name,
  }));
}

export function fakeSchoolCalendarSource(): ISchoolCalendarSource {
  return {
    holidays: async (zone, schoolYear) => Result.ok(holidaysOf(zone.value, schoolYear)),
    bankHolidays: async (territory, year) => Result.ok(bankHolidaysOf(territory, year)),
  };
}
