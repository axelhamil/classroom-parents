import type { ISchoolCalendarSource } from "@modules/school-calendar/application/ports/school-calendar-source.port";
import { schoolCalendarModule } from "@modules/school-calendar/school-calendar.module";
import type { IInstrumentation, IUnitOfWork, Option } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { container, defineModule } from "inwire";
import type { FakeProviders } from "../dev/fake-providers";

interface SchoolCalendarHost {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  FakeProviders: Option<FakeProviders>;
}

const fakeSourceOf = (fakes: Option<FakeProviders>) =>
  defineModule<{ ISchoolCalendarSource: ISchoolCalendarSource }>()((b) =>
    fakes.isNone() ? b : b.override("ISchoolCalendarSource", () => fakes.unwrap().schoolCalendar),
  );

/**
 * The school calendar composed in a container of its own, fed by the host's instrumentation,
 * unit of work and outbox. Why: the main container sits at the type instantiation ceiling of
 * inwire (about 90 bindings), one more key there fails `di.scope` with TS2589.
 */
export const schoolCalendarContainer = (host: SchoolCalendarHost) =>
  container()
    .add("IInstrumentation", () => host.IInstrumentation)
    .add("ITransactionService", () => host.ITransactionService)
    .add("IOutboxRepository", () => host.IOutboxRepository)
    .addModule(schoolCalendarModule)
    .addModule(fakeSourceOf(host.FakeProviders))
    .build();
