import { intlLocale } from "@packages/i18n";
import { useTranslation } from "react-i18next";

export function useIntlLocale(): string {
  const { i18n } = useTranslation();

  return intlLocale(i18n.resolvedLanguage);
}
