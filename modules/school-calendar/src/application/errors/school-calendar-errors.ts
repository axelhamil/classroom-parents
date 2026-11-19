import type { AppError } from "@packages/ddd-kit";

export type SchoolCalendarError = AppError<
  | "SCHOOL_CALENDAR_RANGE_INVALID"
  | "SCHOOL_CALENDAR_ZONE_INVALID"
  | "SCHOOL_CALENDAR_UNAVAILABLE"
  | "SCHOOL_CALENDAR_PROVIDER_FAILURE"
>;

export const rangeInvalid = (reason: string): SchoolCalendarError => ({
  code: "SCHOOL_CALENDAR_RANGE_INVALID",
  message: "Choisissez une période valide, du plus ancien au plus récent, de 400 jours au plus.",
  metadata: { reason },
});

export const zoneInvalid: SchoolCalendarError = {
  code: "SCHOOL_CALENDAR_ZONE_INVALID",
  message: "Cette zone scolaire n'existe pas. Choisissez la zone A, B, C, la Corse ou un DROM.",
};

export const calendarUnavailable: SchoolCalendarError = {
  code: "SCHOOL_CALENDAR_UNAVAILABLE",
  message:
    "Le calendrier officiel ne répond pas pour le moment. Les vacances s'afficheront dès son retour.",
};

export const sourceFailure = (operation: string): SchoolCalendarError => ({
  code: "SCHOOL_CALENDAR_PROVIDER_FAILURE",
  message: `Le calendrier officiel n'a pas répondu (${operation}).`,
});
