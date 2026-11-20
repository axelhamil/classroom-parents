import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { IIcsDownloader } from "./application/ports/ics-downloader.port";
import type { IOwnPeriodRepository } from "./application/ports/own-period-repository.port";
import type { IParentPreferences } from "./application/ports/parent-preferences.port";
import type { ISchoolCalendarChoiceRepository } from "./application/ports/school-calendar-choice-repository.port";
import type { ISchoolCalendarSource } from "./application/ports/school-calendar-source.port";
import { CalendarChoiceService } from "./application/services/calendar-choice.service";
import { HolidayReader } from "./application/services/holiday-reader.service";
import { OfficialCalendarService } from "./application/services/official-calendar.service";
import { SchoolCalendarService } from "./application/services/school-calendar.service";
import { OfficialCalendarSource } from "./infrastructure/adapters/official-calendar.source";
import { SafeIcsDownloader } from "./infrastructure/adapters/safe-ics.downloader";
import { DrizzleOwnPeriodRepository } from "./infrastructure/repositories/drizzle-own-period.repository";
import { DrizzleSchoolCalendarCache } from "./infrastructure/repositories/drizzle-school-calendar.cache";
import { DrizzleSchoolCalendarChoiceRepository } from "./infrastructure/repositories/drizzle-school-calendar-choice.repository";

export interface SchoolCalendarPrerequisites {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  IParentPreferences: IParentPreferences;
}

export const schoolCalendarModule = defineModule<SchoolCalendarPrerequisites>()((b) =>
  b
    .add(
      "ISchoolCalendarSource",
      (c): ISchoolCalendarSource => new OfficialCalendarSource(c.IInstrumentation, fetch),
    )
    .add("IIcsDownloader", (c): IIcsDownloader => new SafeIcsDownloader(c.IInstrumentation, fetch))
    .add(
      "choices",
      (c): ISchoolCalendarChoiceRepository =>
        new DrizzleSchoolCalendarChoiceRepository(c.IInstrumentation),
    )
    .add(
      "ownPeriods",
      (c): IOwnPeriodRepository => new DrizzleOwnPeriodRepository(c.IInstrumentation),
    )
    .add(
      "OfficialCalendarService",
      (c) =>
        new OfficialCalendarService(
          c.ISchoolCalendarSource,
          new DrizzleSchoolCalendarCache(c.IInstrumentation),
          c.IInstrumentation,
        ),
    )
    .add(
      "SchoolCalendarService",
      (c) =>
        new SchoolCalendarService(
          c.choices,
          c.ownPeriods,
          c.OfficialCalendarService,
          new HolidayReader(c.OfficialCalendarService, c.ownPeriods, c.IInstrumentation),
          c.IParentPreferences,
          c.IInstrumentation,
        ),
    )
    .add(
      "CalendarChoiceService",
      (c) =>
        new CalendarChoiceService(
          c.choices,
          c.ownPeriods,
          c.IIcsDownloader,
          c.ITransactionService,
          c.IOutboxRepository,
          c.IInstrumentation,
        ),
    ),
);
