import { createI18n, DEFAULT_LOCALE, loadCatalog } from "@packages/i18n";

export async function frenchCatalog() {
  return createI18n({ locale: DEFAULT_LOCALE, resources: await loadCatalog(DEFAULT_LOCALE) });
}
