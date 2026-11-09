import { frCatalog, lookupCatalogValue } from "@packages/i18n";
import type { ParseKeys } from "i18next";

export function isErrorsKey(key: string): key is ParseKeys<"errors"> {
  return lookupCatalogValue(frCatalog.errors, key) !== undefined;
}
