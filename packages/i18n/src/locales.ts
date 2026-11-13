export const LOCALES = ["fr"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

const INTL_TAGS = { fr: "fr-FR" } as const satisfies Record<Locale, string>;

export function intlLocale(language: unknown): string {
  return INTL_TAGS[toLocale(language)];
}
