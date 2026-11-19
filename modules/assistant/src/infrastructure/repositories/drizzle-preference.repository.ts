import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { eq, resolveExecutor } from "@packages/drizzle";
import { assistantPreference } from "../../../schemas/assistant.schema";
import type { AssistantError } from "../../application/errors/assistant-errors";
import type {
  IPreferenceRepository,
  Preferences,
} from "../../application/ports/preference-repository.port";
import { Country } from "../../domain/preferences/value-objects/country.vo";
import { Locale, localeSchema } from "../../domain/preferences/value-objects/locale.vo";
import { TimeZone } from "../../domain/preferences/value-objects/time-zone.vo";
import { InstrumentedStore } from "./instrumented-store";

type Row = typeof assistantPreference.$inferSelect;

function valid<T>(created: Result<T>): Option<T> {
  return created.isSuccess ? Option.some(created.getValue()) : Option.none();
}

function storedLocale(value: string | null): Option<Locale> {
  const parsed = localeSchema.safeParse(value);
  if (!parsed.success) return Option.none();

  return valid(Locale.create(parsed.data));
}

function preferencesOf(row: Row): Preferences {
  return {
    locale: storedLocale(row.locale),
    timeZone: Option.fromNullable(row.timeZone).flatMap((zone) => valid(TimeZone.create(zone))),
    country: Option.fromNullable(row.country).flatMap((code) => valid(Country.create(code))),
    extractionEnabled: row.extractionEnabled,
  };
}

export class DrizzlePreferenceRepository
  extends InstrumentedStore
  implements IPreferenceRepository
{
  constructor(instrumentation: IInstrumentation) {
    super(instrumentation, "DrizzlePreferenceRepository");
  }

  async find(userId: string): Promise<Result<Option<Preferences>, AssistantError>> {
    const exec = resolveExecutor();
    return this.guarded("find", async () => {
      const rows = await this.run(
        exec
          .select()
          .from(assistantPreference)
          .where(eq(assistantPreference.userId, userId))
          .limit(1),
      );

      return Result.ok(Option.fromNullable(rows[0]).map(preferencesOf));
    });
  }

  async save(
    userId: string,
    preferences: Preferences,
    at: Date,
  ): Promise<Result<void, AssistantError>> {
    const exec = resolveExecutor();
    return this.guarded("save", async () => {
      const values = {
        locale: preferences.locale.map(({ value }) => value).toNull(),
        timeZone: preferences.timeZone.map(({ value }) => value).toNull(),
        country: preferences.country.map(({ value }) => value).toNull(),
        extractionEnabled: preferences.extractionEnabled,
        updatedAt: at,
      };
      await this.run(
        exec
          .insert(assistantPreference)
          .values({ userId, ...values })
          .onConflictDoUpdate({ target: assistantPreference.userId, set: values }),
      );
      return Result.ok();
    });
  }
}
