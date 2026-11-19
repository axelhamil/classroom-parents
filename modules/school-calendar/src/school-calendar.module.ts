import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { ISchoolCalendarSource } from "./application/ports/school-calendar-source.port";
import { OfficialCalendarService } from "./application/services/official-calendar.service";
import { SchoolCalendarService } from "./application/services/school-calendar.service";
import { OpenDataSchoolCalendarSource } from "./infrastructure/adapters/open-data-school-calendar.source";
import { DrizzleSchoolCalendarCache } from "./infrastructure/repositories/drizzle-school-calendar.cache";
import { DrizzleSchoolZoneRepository } from "./infrastructure/repositories/drizzle-school-zone.repository";

export interface SchoolCalendarPrerequisites {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
}

export const schoolCalendarModule = defineModule<SchoolCalendarPrerequisites>()((b) =>
  b
    .add(
      "ISchoolCalendarSource",
      (c): ISchoolCalendarSource => new OpenDataSchoolCalendarSource(c.IInstrumentation, fetch),
    )
    .add(
      "SchoolCalendarService",
      (c) =>
        new SchoolCalendarService(
          new DrizzleSchoolZoneRepository(c.IInstrumentation),
          new OfficialCalendarService(
            c.ISchoolCalendarSource,
            new DrizzleSchoolCalendarCache(c.IInstrumentation),
            c.IInstrumentation,
          ),
          c.ITransactionService,
          c.IOutboxRepository,
          c.IInstrumentation,
        ),
    ),
);
