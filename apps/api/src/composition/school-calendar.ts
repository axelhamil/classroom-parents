import type { IParentPreferences } from "@modules/school-calendar/application/ports/parent-preferences.port";
import type { ISchoolCalendarSource } from "@modules/school-calendar/application/ports/school-calendar-source.port";
import { schoolCalendarModule } from "@modules/school-calendar/school-calendar.module";
import type { IInstrumentation, IUnitOfWork, Option, Result } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { container, defineModule } from "inwire";
import type { FakeProviders } from "../dev/fake-providers";

interface SchoolCalendarHost {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  FakeProviders: Option<FakeProviders>;
}

interface ParentPreferencesReader {
  preferences(
    userId: string,
  ): Promise<Result<{ country: string | null; locale: string | null }, unknown>>;
}

const NO_PREFERENCES = { country: null, language: null };

/**
 * The parent's country and language as the assistant module stores them: the school calendar
 * suggests that country and names holidays in that language. A failed read is no preference
 * (already captured by the assistant), never a failed calendar.
 */
export function parentPreferencesFrom(reader: () => ParentPreferencesReader): IParentPreferences {
  return {
    of: async (userId) => {
      const preferences = await reader().preferences(userId);
      if (preferences.isFailure) return NO_PREFERENCES;

      const { country, locale } = preferences.getValue();

      return { country, language: locale };
    },
  };
}

const fakeSourceOf = (fakes: Option<FakeProviders>) =>
  defineModule<{ ISchoolCalendarSource: ISchoolCalendarSource }>()((b) =>
    fakes.isNone() ? b : b.override("ISchoolCalendarSource", () => fakes.unwrap().schoolCalendar),
  );

/**
 * The school calendar composed in a container of its own, fed by the host's instrumentation,
 * unit of work and outbox, and by the assistant's preferences. Why: the main container sits at the type instantiation ceiling of
 * inwire (about 90 bindings), one more key there fails `di.scope` with TS2589.
 */
export const schoolCalendarContainer = (
  host: SchoolCalendarHost,
  preferences: () => ParentPreferencesReader,
) =>
  container()
    .add("IInstrumentation", () => host.IInstrumentation)
    .add("ITransactionService", () => host.ITransactionService)
    .add("IOutboxRepository", () => host.IOutboxRepository)
    .add("IParentPreferences", () => parentPreferencesFrom(preferences))
    .addModule(schoolCalendarModule)
    .addModule(fakeSourceOf(host.FakeProviders))
    .build();
