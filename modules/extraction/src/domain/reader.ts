export const READER_LOCALES = ["fr", "en", "es", "pt", "ar"] as const;

export type ReaderLocale = (typeof READER_LOCALES)[number];

export interface Reader {
  locale: ReaderLocale;
  timeZone: string;
  country: string | null;
}
