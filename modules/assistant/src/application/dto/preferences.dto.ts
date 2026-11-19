import { z } from "zod";
import { type LocaleValue, localeSchema } from "../../domain/preferences/value-objects/locale.vo";

export const languageAndRegionBodySchema = z.object({
  locale: localeSchema,
  timeZone: z.string().max(64),
  country: z.string().max(2),
});

export type LanguageAndRegionChoice = z.infer<typeof languageAndRegionBodySchema>;

export const extractionBodySchema = z.object({ enabled: z.boolean() });

export interface PreferencesDto {
  locale: LocaleValue | null;
  timeZone: string | null;
  country: string | null;
  extractionEnabled: boolean;
}
