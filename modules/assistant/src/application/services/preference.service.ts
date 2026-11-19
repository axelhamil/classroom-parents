import { type IInstrumentation, type IUnitOfWork, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { Country } from "../../domain/preferences/value-objects/country.vo";
import { Locale, type LocaleValue } from "../../domain/preferences/value-objects/locale.vo";
import { TimeZone } from "../../domain/preferences/value-objects/time-zone.vo";
import type { LanguageAndRegionChoice, PreferencesDto } from "../dto/preferences.dto";
import { type AssistantError, preferenceInvalid } from "../errors/assistant-errors";
import type { IPreferenceRepository, Preferences } from "../ports/preference-repository.port";

type Outcome<T> = Promise<Result<T, AssistantError>>;

type LanguageAndRegion = Omit<Preferences, "extractionEnabled">;

const NOT_CHOSEN: Preferences = {
  locale: Option.none(),
  timeZone: Option.none(),
  country: Option.none(),
  extractionEnabled: true,
};

function dtoOf(preferences: Preferences): PreferencesDto {
  return {
    locale: preferences.locale.map(({ value }): LocaleValue => value).toNull(),
    timeZone: preferences.timeZone.map(({ value }) => value).toNull(),
    country: preferences.country.map(({ value }) => value).toNull(),
    extractionEnabled: preferences.extractionEnabled,
  };
}

function sameDto(left: PreferencesDto, right: PreferencesDto): boolean {
  return (
    left.locale === right.locale &&
    left.timeZone === right.timeZone &&
    left.country === right.country &&
    left.extractionEnabled === right.extractionEnabled
  );
}

export class PreferenceService {
  constructor(
    private readonly repository: IPreferenceRepository,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async preferences(userId: string): Outcome<PreferencesDto> {
    return this.span("preferences", async () => (await this.current(userId)).map(dtoOf));
  }

  async extractionEnabled(userId: string): Outcome<boolean> {
    return this.span("extractionEnabled", async () =>
      (await this.current(userId)).map(({ extractionEnabled }) => extractionEnabled),
    );
  }

  async chooseLanguageAndRegion(
    userId: string,
    choice: LanguageAndRegionChoice,
  ): Outcome<PreferencesDto> {
    return this.span("chooseLanguageAndRegion", async () => {
      const chosen = this.languageAndRegionOf(choice);
      if (chosen.isFailure) return Result.fail(chosen.getError());

      return this.change(userId, (current) => ({ ...current, ...chosen.getValue() }));
    });
  }

  async setExtraction(userId: string, enabled: boolean): Outcome<PreferencesDto> {
    return this.span("setExtraction", () =>
      this.change(userId, (current) => ({ ...current, extractionEnabled: enabled })),
    );
  }

  private languageAndRegionOf(
    choice: LanguageAndRegionChoice,
  ): Result<LanguageAndRegion, AssistantError> {
    const locale = Locale.create(choice.locale);
    if (locale.isFailure) return Result.fail(preferenceInvalid("locale"));

    const timeZone = TimeZone.create(choice.timeZone);
    if (timeZone.isFailure) return Result.fail(preferenceInvalid("timeZone"));

    const country = Country.create(choice.country);
    if (country.isFailure) return Result.fail(preferenceInvalid("country"));

    return Result.ok({
      locale: Option.some(locale.getValue()),
      timeZone: Option.some(timeZone.getValue()),
      country: Option.some(country.getValue()),
    });
  }

  private change(
    userId: string,
    edit: (current: Preferences) => Preferences,
  ): Outcome<PreferencesDto> {
    return this.transactions.run(async () => {
      const current = await this.current(userId);
      if (current.isFailure) return Result.fail(current.getError());

      const before = dtoOf(current.getValue());
      const next = edit(current.getValue());
      const after = dtoOf(next);
      if (sameDto(before, after)) return Result.ok(after);

      const saved = await this.repository.save(userId, next, this.clock());
      if (saved.isFailure) return Result.fail(saved.getError());

      await emitEvent(this.outbox, EventTypes.ASSISTANT_PREFERENCE_CHANGED, "user", userId, {
        userId,
        ...after,
      });
      return Result.ok(after);
    });
  }

  private async current(userId: string): Outcome<Preferences> {
    return (await this.repository.find(userId)).map((found) => found.unwrapOr(NOT_CHOSEN));
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `PreferenceService > ${method}`, op: "function" },
      work,
    );
  }
}
