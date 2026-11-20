import type { AppError } from "@packages/ddd-kit";

export type SchoolCalendarError = AppError<
  | "SCHOOL_CALENDAR_RANGE_INVALID"
  | "SCHOOL_CALENDAR_CHOICE_INVALID"
  | "SCHOOL_CALENDAR_COUNTRY_INVALID"
  | "SCHOOL_CALENDAR_PERIOD_INVALID"
  | "SCHOOL_CALENDAR_PERIOD_NOT_FOUND"
  | "SCHOOL_CALENDAR_ICS_INVALID"
  | "SCHOOL_CALENDAR_ICS_URL_INVALID"
  | "SCHOOL_CALENDAR_ICS_PROVIDER_FAILURE"
  | "SCHOOL_CALENDAR_UNAVAILABLE"
  | "SCHOOL_CALENDAR_PROVIDER_FAILURE"
>;

export const rangeInvalid = (reason: string): SchoolCalendarError => ({
  code: "SCHOOL_CALENDAR_RANGE_INVALID",
  message: "Choisissez une période valide, du plus ancien au plus récent, de 400 jours au plus.",
  metadata: { reason },
});

export const choiceInvalid = (reason: string): SchoolCalendarError => ({
  code: "SCHOOL_CALENDAR_CHOICE_INVALID",
  message: "Ce calendrier scolaire n'existe pas. Choisissez un pays, puis une région de ce pays.",
  metadata: { reason },
});

export const countryInvalid: SchoolCalendarError = {
  code: "SCHOOL_CALENDAR_COUNTRY_INVALID",
  message: "Aucun calendrier n'est connu pour ce pays. Choisissez un pays de la liste.",
};

export const periodInvalid = (reason: string): SchoolCalendarError => ({
  code: "SCHOOL_CALENDAR_PERIOD_INVALID",
  message: "Donnez un nom à la période et des dates dans l'ordre, sur moins de 120 jours.",
  metadata: { reason },
});

export const periodNotFound: SchoolCalendarError = {
  code: "SCHOOL_CALENDAR_PERIOD_NOT_FOUND",
  message: "Cette période de vacances n'existe plus.",
};

export const icsInvalid = (reason: string): SchoolCalendarError => ({
  code: "SCHOOL_CALENDAR_ICS_INVALID",
  message:
    "Ce fichier n'est pas un calendrier lisible. Importez le fichier .ics publié par l'école, de 512 Ko au plus.",
  metadata: { reason },
});

export const icsUrlInvalid = (reason: string): SchoolCalendarError => ({
  code: "SCHOOL_CALENDAR_ICS_URL_INVALID",
  message:
    "Ce lien ne peut pas être lu. Collez un lien public qui commence par https://, ou importez le fichier.",
  metadata: { reason },
});

export const icsUnreachable = (reason: string): SchoolCalendarError => ({
  code: "SCHOOL_CALENDAR_ICS_PROVIDER_FAILURE",
  message: "Le site de l'école ne répond pas. Réessayez plus tard, ou importez le fichier.",
  metadata: { reason },
});

export const calendarUnavailable: SchoolCalendarError = {
  code: "SCHOOL_CALENDAR_UNAVAILABLE",
  message:
    "Le calendrier officiel ne répond pas pour le moment. Les vacances s'afficheront dès son retour.",
};

export const sourceFailure = (operation: string): SchoolCalendarError => ({
  code: "SCHOOL_CALENDAR_PROVIDER_FAILURE",
  message: `Le calendrier officiel n'a pas répondu (${operation}).`,
});
