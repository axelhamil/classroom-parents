import frCatalog from "./catalogs/fr";
import type { Locale } from "./locales";

type WidenStrings<T> = T extends string ? string : { [K in keyof T]: WidenStrings<T[K]> };

export type Resources = WidenStrings<typeof frCatalog>;

const CATALOGS: Record<Locale, Resources> = { fr: frCatalog };

export function loadCatalog(locale: Locale): Promise<Resources> {
  return Promise.resolve(CATALOGS[locale]);
}
