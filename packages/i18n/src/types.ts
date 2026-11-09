import type frCatalog from "./catalogs/fr";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: typeof frCatalog;
    returnNull: false;
  }
}
