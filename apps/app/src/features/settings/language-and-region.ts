import type { LanguageAndRegionChoice } from "./api/settings.mutations";

type ParentLocale = LanguageAndRegionChoice["locale"];

export const PARENT_LOCALES = [
  "fr",
  "en",
  "es",
  "pt",
  "ar",
] as const satisfies readonly ParentLocale[];

const DEFAULT_LOCALE: ParentLocale = "fr";

const DEFAULT_COUNTRY = "FR";

const NOT_A_COUNTRY = new Set(["EU", "EZ", "UN", "ZZ"]);

const COUNTRY_OF_TIME_ZONE: Readonly<Record<string, string>> = {
  "Europe/Paris": "FR",
  "Indian/Reunion": "FR",
  "Indian/Mayotte": "FR",
  "America/Guadeloupe": "FR",
  "America/Martinique": "FR",
  "America/Cayenne": "FR",
  "Europe/Brussels": "BE",
  "Europe/Zurich": "CH",
  "Europe/Luxembourg": "LU",
  "Europe/Monaco": "MC",
  "America/Toronto": "CA",
  "America/Montreal": "CA",
  "America/Halifax": "CA",
  "America/Winnipeg": "CA",
  "America/Edmonton": "CA",
  "America/Vancouver": "CA",
  "Africa/Casablanca": "MA",
  "Africa/Algiers": "DZ",
  "Africa/Tunis": "TN",
  "Africa/Dakar": "SN",
  "Africa/Abidjan": "CI",
  "Europe/Lisbon": "PT",
  "Atlantic/Madeira": "PT",
  "Atlantic/Azores": "PT",
  "America/Sao_Paulo": "BR",
  "America/Bahia": "BR",
  "America/Fortaleza": "BR",
  "America/Recife": "BR",
  "America/Belem": "BR",
  "America/Manaus": "BR",
  "Europe/Madrid": "ES",
  "Atlantic/Canary": "ES",
  "America/Mexico_City": "MX",
  "America/Monterrey": "MX",
  "America/Cancun": "MX",
  "America/Tijuana": "MX",
  "America/Argentina/Buenos_Aires": "AR",
  "America/Buenos_Aires": "AR",
  "America/Bogota": "CO",
  "Europe/London": "GB",
  "Europe/Dublin": "IE",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Phoenix": "US",
  "America/Los_Angeles": "US",
  "America/Anchorage": "US",
  "Pacific/Honolulu": "US",
};

const regionNames = new Intl.DisplayNames(["fr"], { type: "region", fallback: "none" });

const LETTERS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));

interface CountryOption {
  code: string;
  name: string;
}

export const COUNTRY_OPTIONS: readonly CountryOption[] = LETTERS.flatMap((first) =>
  LETTERS.map((second) => `${first}${second}`),
)
  .filter((code) => !NOT_A_COUNTRY.has(code))
  .flatMap((code) => {
    const name = regionNames.of(code);

    return name ? [{ code, name }] : [];
  })
  .sort((a, b) => a.name.localeCompare(b.name, "fr"));

const COUNTRY_CODES = new Set(COUNTRY_OPTIONS.map(({ code }) => code));

export function languageAutonym(locale: ParentLocale): string {
  const name = new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale;

  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

export function timeZoneOptions(current: string): readonly string[] {
  const zones = Intl.supportedValuesOf("timeZone");

  return zones.includes(current) ? zones : [...zones, current].sort();
}

export function timeZoneLabel(timeZone: string): string {
  return timeZone.replaceAll("_", " ");
}

function isParentLocale(value: string): value is ParentLocale {
  return PARENT_LOCALES.some((locale) => locale === value);
}

function deviceLocale(): ParentLocale {
  const bases = navigator.languages.map((tag) => new Intl.Locale(tag).language);

  return bases.find(isParentLocale) ?? DEFAULT_LOCALE;
}

function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function deviceCountry(timeZone: string): string {
  const fromTimeZone = COUNTRY_OF_TIME_ZONE[timeZone];
  if (fromTimeZone) return fromTimeZone;

  const fromLanguage = new Intl.Locale(navigator.language).region;
  if (fromLanguage && COUNTRY_CODES.has(fromLanguage)) return fromLanguage;

  return DEFAULT_COUNTRY;
}

interface StoredLanguageAndRegion {
  locale: ParentLocale | null;
  timeZone: string | null;
  country: string | null;
}

export function languageAndRegionOrDevice(
  stored: StoredLanguageAndRegion,
): LanguageAndRegionChoice {
  const timeZone = stored.timeZone ?? deviceTimeZone();

  return {
    locale: stored.locale ?? deviceLocale(),
    timeZone,
    country: stored.country ?? deviceCountry(timeZone),
  };
}
