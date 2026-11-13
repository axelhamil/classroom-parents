import { createInstance, type i18n } from "i18next";
import type { Namespace } from "./catalogs/fr";
import { loadCatalog, type Resources } from "./load-catalog";
import { DEFAULT_LOCALE, type Locale } from "./locales";
import "./types";

export interface CreateI18nOptions {
  locale: Locale;
  resources: Resources;
}

export async function createI18n({ locale, resources }: CreateI18nOptions): Promise<i18n> {
  const instance = createInstance();
  await instance.init({
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    load: "languageOnly",
    defaultNS: "common",
    ns: Object.keys(resources),
    resources: { [locale]: resources },
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return instance;
}

export async function i18nFor(locale: Locale): Promise<i18n> {
  return createI18n({ locale, resources: await loadCatalog(locale) });
}

export async function fixedT<N extends Namespace>(locale: Locale, namespace: N) {
  return (await i18nFor(locale)).getFixedT(locale, namespace);
}
