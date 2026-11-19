import type { Option, Result } from "@packages/ddd-kit";
import type { Country } from "../../domain/preferences/value-objects/country.vo";
import type { Locale } from "../../domain/preferences/value-objects/locale.vo";
import type { TimeZone } from "../../domain/preferences/value-objects/time-zone.vo";
import type { AssistantError } from "../errors/assistant-errors";

export interface Preferences {
  locale: Option<Locale>;
  timeZone: Option<TimeZone>;
  country: Option<Country>;
  extractionEnabled: boolean;
}

export interface IPreferenceRepository {
  find(userId: string): Promise<Result<Option<Preferences>, AssistantError>>;

  save(userId: string, preferences: Preferences, at: Date): Promise<Result<void, AssistantError>>;
}
