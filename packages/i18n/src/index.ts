// Side-effect import: `types.ts` only augments i18next's `CustomTypeOptions`,
// so it has nothing to re-export. Importing it from the package entry point is
// what makes `t("…")` key-checked for every consumer, whether or not they also
// import `createI18n`.
import "./types";

export { default as frCatalog, NAMESPACES, type Namespace } from "./catalogs/fr";
export { type CreateI18nOptions, createI18n, fixedT, i18nFor } from "./create-instance";
export { utcDay, wallDateLabel, wallTimeLabel, withWallTime } from "./deadline-format";
export { loadCatalog, type Resources } from "./load-catalog";
export {
  DEFAULT_LOCALE,
  intlLocale,
  isLocale,
  LOCALES,
  type Locale,
  toLocale,
} from "./locales";
export { lookupCatalogValue } from "./lookup";
export { resolveLocale } from "./resolve";
